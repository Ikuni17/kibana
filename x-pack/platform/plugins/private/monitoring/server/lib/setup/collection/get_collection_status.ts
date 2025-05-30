/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CollectorFetchContext, UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';
import { get, uniq } from 'lodash';
import {
  INDEX_PATTERN_TYPES,
  KIBANA_STATS_TYPE_MONITORING,
  METRICBEAT_INDEX_NAME_UNIQUE_TOKEN,
} from '../../../../common/constants';
import { TimeRange } from '../../../../common/http_api/shared';
import { LegacyRequest } from '../../../types';
import { getLegacyIndexPattern } from '../../../../common/get_index_patterns';
import { getLivesNodes } from '../../elasticsearch/nodes/get_nodes/get_live_nodes';

interface Bucket {
  key: string;
  single_type?: {
    beat_type: {
      buckets: Array<{ key: string }>;
    };
  };
}

type COLLECTION_PRODUCT_NAMES = Exclude<INDEX_PATTERN_TYPES, 'enterprisesearch'>;

const NUMBER_OF_SECONDS_AGO_TO_LOOK = 30;

const getRecentMonitoringDocuments = async (
  req: LegacyRequest<unknown, unknown, { timeRange?: TimeRange }>,
  indexPatterns: string[],
  clusterUuid?: string,
  nodeUuid?: string,
  size?: number
) => {
  const start = get(req.payload, 'timeRange.min') || `now-${NUMBER_OF_SECONDS_AGO_TO_LOOK}s`;
  const end = get(req.payload, 'timeRange.max') || 'now';

  const filters: any[] = [
    {
      range: {
        timestamp: {
          gte: start,
          lte: end,
        },
      },
    },
  ];

  if (clusterUuid) {
    filters.push({ term: { cluster_uuid: clusterUuid } });
  }

  const nodesClause: Record<string, any> = {};
  if (nodeUuid) {
    nodesClause.must = [
      {
        bool: {
          should: [
            { term: { 'node_stats.node_id': nodeUuid } },
            { term: { 'kibana_stats.kibana.uuid': nodeUuid } },
            { term: { 'beats_stats.beat.uuid': nodeUuid } },
            { term: { 'logstash_stats.logstash.uuid': nodeUuid } },
          ],
        },
      },
    ];
  }

  const params = {
    index: Object.values(indexPatterns),
    size: 0,
    ignore_unavailable: true,
    filter_path: ['aggregations.indices.buckets'],
    query: {
      bool: {
        filter: filters,
        ...nodesClause,
      },
    },
    aggs: {
      indices: {
        terms: {
          field: '_index',
          size: 50,
        },
        aggs: {
          es_uuids: {
            terms: {
              field: 'node_stats.node_id',
              size,
            },
            aggs: {
              single_type: {
                filter: {
                  bool: {
                    should: [
                      { term: { type: 'node_stats' } },
                      { term: { 'metricset.name': 'node_stats' } },
                    ],
                  },
                },
                aggs: {
                  by_timestamp: {
                    max: {
                      field: 'timestamp',
                    },
                  },
                },
              },
            },
          },
          kibana_uuids: {
            terms: {
              field: 'kibana_stats.kibana.uuid',
              size,
            },
            aggs: {
              single_type: {
                filter: {
                  bool: {
                    should: [
                      { term: { type: 'kibana_stats' } },
                      { term: { 'metricset.name': 'stats' } },
                    ],
                  },
                },
                aggs: {
                  by_timestamp: {
                    max: {
                      field: 'timestamp',
                    },
                  },
                },
              },
            },
          },
          beats_uuids: {
            terms: {
              field: 'beats_stats.beat.uuid',
              size,
            },
            aggs: {
              single_type: {
                filter: {
                  bool: {
                    should: [
                      { term: { type: 'beats_stats' } },
                      { term: { 'metricset.name': 'beats_stats' } },
                    ],
                  },
                },
                aggs: {
                  by_timestamp: {
                    max: {
                      field: 'timestamp',
                    },
                  },
                  beat_type: {
                    terms: {
                      field: 'beats_stats.beat.type',
                      size,
                    },
                  },
                  cluster_uuid: {
                    terms: {
                      field: 'cluster_uuid',
                      size,
                    },
                  },
                },
              },
            },
          },
          logstash_uuids: {
            terms: {
              field: 'logstash_stats.logstash.uuid',
              size,
            },
            aggs: {
              single_type: {
                filter: {
                  bool: {
                    should: [
                      { term: { type: 'logstash_stats' } },
                      { term: { 'metricset.name': 'stats' } },
                    ],
                  },
                },
                aggs: {
                  by_timestamp: {
                    max: {
                      field: 'timestamp',
                    },
                  },
                  cluster_uuid: {
                    terms: {
                      field: 'cluster_uuid',
                      size,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const { callWithRequest } = req.server.plugins.elasticsearch.getCluster('monitoring');
  return await callWithRequest(req, 'search', params);
};

async function doesIndexExist(req: LegacyRequest, index: string) {
  const params = {
    index,
    size: 0,
    terminate_after: 1,
    ignore_unavailable: true,
    filter_path: ['hits.total.value'],
  };
  const { callWithRequest } = req.server.plugins.elasticsearch.getCluster('monitoring');
  const response = await callWithRequest(req, 'search', params);
  return get(response, 'hits.total.value', 0) > 0;
}

async function detectProducts(req: LegacyRequest, isLiveCluster: boolean) {
  const result: Record<COLLECTION_PRODUCT_NAMES, Record<string, boolean>> = {
    kibana: {
      doesExist: true,
    },
    elasticsearch: {
      doesExist: true,
    },
    beats: {
      mightExist: false,
    },
    apm: {
      mightExist: false,
    },
    logstash: {
      mightExist: false,
    },
  };

  const detectionSearch: Array<{
    id: COLLECTION_PRODUCT_NAMES;
    indices: string[];
  }> = [
    {
      id: 'beats',
      indices: ['*beat-*', '.management-beats*'],
    },
    {
      id: 'logstash',
      indices: ['logstash-*', '.logstash*'],
    },
    {
      id: 'apm',
      indices: ['apm-*'],
    },
  ];

  if (isLiveCluster) {
    for (const { id, indices } of detectionSearch) {
      const exists = await doesIndexExist(req, indices.join(','));
      if (exists) {
        result[id].mightExist = true;
      }
    }
  }

  return result;
}

function getUuidBucketName(productName: COLLECTION_PRODUCT_NAMES) {
  switch (productName) {
    case 'elasticsearch':
      return 'es_uuids';
    case 'kibana':
      return 'kibana_uuids';
    case 'beats':
    case 'apm':
      return 'beats_uuids';
    case 'logstash':
      return 'logstash_uuids';
    default:
      throw new Error('Invalid `productName`');
  }
}

function isBeatFromAPM(bucket: Bucket) {
  const beatType = get(bucket, 'single_type.beat_type');
  if (!beatType) {
    return false;
  }

  return get(beatType, 'buckets[0].key') === 'apm-server';
}

async function hasNecessaryPermissions(req: LegacyRequest<unknown, unknown, unknown>) {
  const licenseService = await req.server.plugins.monitoring.info.getLicenseService();
  const securityFeature = licenseService.getSecurityFeature();
  if (!securityFeature.isAvailable || !securityFeature.isEnabled) {
    return true;
  }
  try {
    const { callWithRequest } = req.server.plugins.elasticsearch.getCluster('data');
    const response = await callWithRequest(req, 'transport.request', {
      method: 'POST',
      path: '/_security/user/_has_privileges',
      body: {
        cluster: ['monitor'],
      },
    });
    // If there is some problem, assume they do not have access
    return get(response, 'has_all_requested', false);
  } catch (err: any) {
    if (
      err.message === 'no handler found for uri [/_security/user/_has_privileges] and method [POST]'
    ) {
      return true;
    }
    if (err.message.includes('Invalid index name [_security]')) {
      return true;
    }
    return false;
  }
}

/**
 * Determines if we should ignore this bucket from this product.
 *
 * We need this logic because APM and Beats are separate products, but their
 * monitoring data appears in the same index (.monitoring-beats-*) and the single
 * way to determine the difference between two documents in that index
 * is `beats_stats.beat.type` which we are performing a terms agg in the above query.
 * If that value is `apm-server` and we're attempting to calculating status for beats
 * we need to ignore that data from that particular  bucket.
 *
 * @param {*} product The product object, which are stored in PRODUCTS
 * @param {*} bucket The agg bucket in the response
 */
function shouldSkipBucket(product: { name: INDEX_PATTERN_TYPES }, bucket: Bucket) {
  if (product.name === 'beats' && isBeatFromAPM(bucket)) {
    return true;
  }
  if (product.name === 'apm' && !isBeatFromAPM(bucket)) {
    return true;
  }
  return false;
}

async function getLiveKibanaInstance(usageCollection?: UsageCollectionSetup) {
  if (!usageCollection) {
    return null;
  }
  const kibanaStatsCollector = usageCollection.getCollectorByType(KIBANA_STATS_TYPE_MONITORING);
  if (!(await kibanaStatsCollector?.isReady())) {
    return null;
  }
  return usageCollection.toApiFieldNames(
    (await kibanaStatsCollector!.fetch(undefined as unknown as CollectorFetchContext)) as unknown[]
  );
}

async function getLiveElasticsearchClusterUuid(req: LegacyRequest<unknown, unknown, unknown>) {
  const params = {
    path: '/_cluster/state/cluster_uuid',
    method: 'GET',
  };

  const { callWithRequest } = req.server.plugins.elasticsearch.getCluster('data');
  const { cluster_uuid: clusterUuid } = await callWithRequest(req, 'transport.request', params);
  return clusterUuid;
}

async function getLiveElasticsearchCollectionEnabled(
  req: LegacyRequest<unknown, unknown, unknown>
) {
  const { callWithRequest } = req.server.plugins.elasticsearch.getCluster('admin');
  const response = await callWithRequest(req, 'transport.request', {
    method: 'GET',
    path: '/_cluster/settings?include_defaults',
    filter_path: [
      'persistent.xpack.monitoring',
      'transient.xpack.monitoring',
      'defaults.xpack.monitoring',
    ],
  });
  const sources = ['persistent', 'transient', 'defaults'];
  for (const source of sources) {
    const collectionSettings = get(response[source], 'xpack.monitoring.elasticsearch.collection');
    if (collectionSettings && collectionSettings.enabled === 'true') {
      return true;
    }
  }
  return false;
}

/**
 * This function will scan all monitoring documents within the past 30s (or a custom time range is supported too)
 * and determine which products fall into one of four states:
 * - isNetNewUser: This means we have detected this instance without monitoring and know that monitoring isn't connected to it. This is really only applicable to ES nodes from the same cluster Kibana is talking to.
 * - isPartiallyMigrated: This means we are seeing some monitoring documents from MB and some from internal collection
 * - isFullyMigrated: This means we are only seeing monitoring documents from MB
 * - isInternalCollector: This means we are only seeing monitoring documents from internal collection
 *
 * If a product is partially migrated, this function will also return the timestamp of the last seen monitoring
 * document from internal collection. This will help the user understand if they successfully disabled internal
 * collection and just need to wait for the time window of the query to exclude the older, internally collected documents
 *
 * If a product is not detected at all (no monitoring documents), we will attempt to do some self discovery
 * based on assumptions around indices that might exist with various products. We will return something
 * like this in that case:
 * detected: {
 *   doesExist: boolean, // This product definitely exists but does not have any monitoring documents (kibana and ES)
 *   mightExist: boolean, // This product might exist based on the presence of some other indices
 * }

 * @param {*} req Standard request object. Can contain a timeRange to use for the query
 * @param {*} indexPatterns Map of index patterns to search against (will be all .monitoring-* indices)
 * @param {*} clusterUuid Optional and will be used to filter down the query if used
 * @param {*} nodeUuid Optional and will be used to filter down the query if used
 * @param {*} skipLiveData Optional and will not make any live api calls if set to true
 */
export const getCollectionStatus = async (
  req: LegacyRequest<unknown, unknown, { timeRange?: TimeRange; ccs?: string }>,
  clusterUuid?: string,
  nodeUuid?: string,
  skipLiveData?: boolean
) => {
  const config = req.server.config;
  const kibanaUuid = req.server.instanceUuid;
  const size = config.ui.max_bucket_size;
  const hasPermissions = await hasNecessaryPermissions(req);

  if (!hasPermissions) {
    return {
      _meta: {
        hasPermissions: false,
      },
    };
  }
  const liveClusterUuid = skipLiveData ? null : await getLiveElasticsearchClusterUuid(req);
  const isLiveCluster = !clusterUuid || liveClusterUuid === clusterUuid;

  const PRODUCTS: Array<{
    name: COLLECTION_PRODUCT_NAMES;
    token?: string;
  }> = [
    { name: 'kibana' },
    { name: 'beats' },
    { name: 'logstash' },
    { name: 'apm', token: '-beats-' },
    { name: 'elasticsearch', token: '-es-' },
  ];

  const indexPatterns = PRODUCTS.map((product) =>
    getLegacyIndexPattern({
      moduleType: product.name,
      ccs: req.payload?.ccs,
      config,
    })
  );

  const [recentDocuments, detectedProducts] = await Promise.all([
    await getRecentMonitoringDocuments(req, indexPatterns, clusterUuid, nodeUuid, size),
    await detectProducts(req, isLiveCluster),
  ]);

  const liveEsNodes = skipLiveData || !isLiveCluster ? [] : await getLivesNodes(req);
  const { usageCollection } = req.server.newPlatform.setup.plugins;
  const liveKibanaInstance =
    skipLiveData || !isLiveCluster ? {} : await getLiveKibanaInstance(usageCollection);
  const indicesBuckets = get(recentDocuments, 'aggregations.indices.buckets', []);
  const liveClusterInternalCollectionEnabled = await getLiveElasticsearchCollectionEnabled(req);

  const status: Record<string, any> = PRODUCTS.reduce((products, product) => {
    const token = product.token || product.name;
    const uuidBucketName = getUuidBucketName(product.name);
    const indexBuckets = indicesBuckets.filter((bucket: Bucket) => {
      if (bucket.key.includes(token)) {
        return true;
      }
      return false;
    });

    const productStatus: Record<string, any> = {
      totalUniqueInstanceCount: 0,
      totalUniqueInternallyCollectedCount: 0,
      totalUniqueFullyMigratedCount: 0,
      totalUniquePartiallyMigratedCount: 0,
      detected: null,
      byUuid: {} as Record<string, any>,
    };

    const fullyMigratedUuidsMap: Record<string, any> = {};
    const internalCollectorsUuidsMap: Record<string, any> = {};
    const partiallyMigratedUuidsMap: Record<string, any> = {};

    // If there is no data, then they are a net new user
    if (!indexBuckets || indexBuckets.length === 0) {
      productStatus.totalUniqueInstanceCount = 0;
    }
    // If there is a single bucket, then they are fully migrated or fully on the internal collector
    else if (indexBuckets.length === 1) {
      const singleIndexBucket = indexBuckets[0];
      const isFullyMigrated = singleIndexBucket.key.includes(METRICBEAT_INDEX_NAME_UNIQUE_TOKEN);

      const map = isFullyMigrated ? fullyMigratedUuidsMap : internalCollectorsUuidsMap;
      const uuidBuckets = get(singleIndexBucket, `${uuidBucketName}.buckets`, []);
      for (const bucket of uuidBuckets) {
        if (shouldSkipBucket(product, bucket)) {
          continue;
        }
        const { key, single_type: singleType } = bucket;
        if (!map[key]) {
          const { by_timestamp: byTimestamp } = singleType;
          map[key] = { lastTimestamp: get(byTimestamp, 'value') };
          if (product.name === 'kibana' && key === kibanaUuid) {
            map[key].isPrimary = true;
          }
          if (product.name === 'beats') {
            map[key].beatType = get(bucket.single_type, 'beat_type.buckets[0].key');
          }
          if (singleType.cluster_uuid) {
            map[key].clusterUuid = get(singleType.cluster_uuid, 'buckets[0].key', '') || null;
          }
        }
      }
      productStatus.totalUniqueInstanceCount = Object.keys(map).length;
      productStatus.totalUniqueInternallyCollectedCount = Object.keys(
        internalCollectorsUuidsMap
      ).length;
      productStatus.totalUniquePartiallyMigratedCount =
        Object.keys(partiallyMigratedUuidsMap).length;
      productStatus.totalUniqueFullyMigratedCount = Object.keys(fullyMigratedUuidsMap).length;
      productStatus.byUuid = {
        ...productStatus.byUuid,
        ...Object.keys(internalCollectorsUuidsMap).reduce(
          (accum, uuid) => ({
            ...accum,
            [uuid]: {
              ...internalCollectorsUuidsMap[uuid],
              ...productStatus.byUuid[uuid],
              isInternalCollector: true,
              isNetNewUser: false,
            },
          }),
          {}
        ),
        ...Object.keys(partiallyMigratedUuidsMap).reduce(
          (accum, uuid) => ({
            ...accum,
            [uuid]: {
              ...partiallyMigratedUuidsMap[uuid],
              ...productStatus.byUuid[uuid],
              isPartiallyMigrated: true,
              isNetNewUser: false,
            },
          }),
          {}
        ),
        ...Object.keys(fullyMigratedUuidsMap).reduce(
          (accum, uuid) => ({
            ...accum,
            [uuid]: {
              ...fullyMigratedUuidsMap[uuid],
              ...productStatus.byUuid[uuid],
              isFullyMigrated: true,
              isNetNewUser: false,
            },
          }),
          {}
        ),
      };
    }
    // If there are multiple buckets, they are partially upgraded assuming a single mb index exists
    else {
      const considerAllInstancesMigrated =
        product.name === 'elasticsearch' &&
        clusterUuid === liveClusterUuid &&
        !liveClusterInternalCollectionEnabled;
      const internalTimestamps: number[] = [];
      for (const indexBucket of indexBuckets) {
        const isFullyMigrated =
          considerAllInstancesMigrated ||
          indexBucket.key.includes(METRICBEAT_INDEX_NAME_UNIQUE_TOKEN);
        const map = isFullyMigrated ? fullyMigratedUuidsMap : internalCollectorsUuidsMap;
        const otherMap = !isFullyMigrated ? fullyMigratedUuidsMap : internalCollectorsUuidsMap;

        const uuidBuckets = get(indexBucket, `${uuidBucketName}.buckets`, []);
        for (const bucket of uuidBuckets) {
          if (shouldSkipBucket(product, bucket)) {
            continue;
          }

          const { key, single_type: singleType } = bucket;
          const { by_timestamp: byTimestamp } = singleType;
          if (!map[key]) {
            if (otherMap[key]) {
              partiallyMigratedUuidsMap[key] = otherMap[key] || {};
              delete otherMap[key];
            } else {
              map[key] = {};
              if (product.name === 'kibana' && key === kibanaUuid) {
                map[key].isPrimary = true;
              }
              if (product.name === 'beats') {
                map[key].beatType = get(singleType.beat_type, 'buckets[0].key');
              }
              if (singleType.cluster_uuid) {
                map[key].clusterUuid = get(singleType.cluster_uuid, 'buckets[0].key', '') || null;
              }
            }
          }
          if (!isFullyMigrated) {
            internalTimestamps.push(byTimestamp.value);
          }
        }
      }

      productStatus.totalUniqueInstanceCount = uniq([
        ...Object.keys(internalCollectorsUuidsMap),
        ...Object.keys(fullyMigratedUuidsMap),
        ...Object.keys(partiallyMigratedUuidsMap),
      ]).length;
      productStatus.totalUniqueInternallyCollectedCount = Object.keys(
        internalCollectorsUuidsMap
      ).length;
      productStatus.totalUniquePartiallyMigratedCount =
        Object.keys(partiallyMigratedUuidsMap).length;
      productStatus.totalUniqueFullyMigratedCount = Object.keys(fullyMigratedUuidsMap).length;
      productStatus.byUuid = {
        ...productStatus.byUuid,
        ...Object.keys(internalCollectorsUuidsMap).reduce(
          (accum, uuid) => ({
            ...accum,
            [uuid]: {
              ...internalCollectorsUuidsMap[uuid],
              ...productStatus.byUuid[uuid],
              isInternalCollector: true,
              isNetNewUser: false,
            },
          }),
          {}
        ),
        ...Object.keys(partiallyMigratedUuidsMap).reduce(
          (accum, uuid) => ({
            ...accum,
            [uuid]: {
              ...partiallyMigratedUuidsMap[uuid],
              ...productStatus.byUuid[uuid],
              isPartiallyMigrated: true,
              lastInternallyCollectedTimestamp: internalTimestamps[0],
              isNetNewUser: false,
            },
          }),
          {}
        ),
        ...Object.keys(fullyMigratedUuidsMap).reduce(
          (accum, uuid) => ({
            ...accum,
            [uuid]: {
              ...fullyMigratedUuidsMap[uuid],
              ...productStatus.byUuid[uuid],
              isFullyMigrated: true,
              isNetNewUser: false,
            },
          }),
          {}
        ),
      };
    }

    if (productStatus.totalUniqueInstanceCount === 0) {
      productStatus.detected = detectedProducts[product.name];
    }

    if (product.name === 'elasticsearch' && liveEsNodes.length) {
      productStatus.byUuid = liveEsNodes.reduce((byUuid, esNode) => {
        if (!byUuid[esNode.id]) {
          productStatus.totalUniqueInstanceCount++;
          return {
            ...byUuid,
            [esNode.id]: {
              node: esNode,
              isNetNewUser: true,
            },
          };
        }
        return byUuid;
      }, productStatus.byUuid);
    }

    if (product.name === 'kibana' && liveKibanaInstance) {
      const kibanaLiveUuid = get(liveKibanaInstance, 'kibana.uuid');
      if (kibanaLiveUuid && !productStatus.byUuid[kibanaLiveUuid]) {
        productStatus.totalUniqueInstanceCount++;
        productStatus.byUuid = {
          [kibanaLiveUuid]: {
            instance: liveKibanaInstance,
            isNetNewUser: true,
          },
        };
      }
    }

    return {
      ...products,
      [product.name]: productStatus,
    };
  }, {});

  status._meta = {
    secondsAgo: NUMBER_OF_SECONDS_AGO_TO_LOOK,
    liveClusterUuid,
    hasPermissions,
  };

  return status;
};
