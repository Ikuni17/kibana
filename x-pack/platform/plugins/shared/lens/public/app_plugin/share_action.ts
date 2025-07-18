/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Reference } from '@kbn/content-management-utils';
import type { SerializableRecord } from '@kbn/utility-types';
import { DataViewSpec } from '@kbn/data-views-plugin/common';
import type { LensAppLocatorParams } from '../../common/locator/locator';
import type { LensAppState } from '../state_management';
import type { LensAppServices } from './types';
import type { LensDocument } from '../persistence';
import type { DatasourceMap, VisualizationMap } from '../types';
import { extractReferencesFromState, getResolvedDateRange } from '../utils';
import { getEditPath } from '../../common/constants';

export interface ShareableConfiguration
  extends Pick<
    LensAppState,
    'activeDatasourceId' | 'datasourceStates' | 'visualization' | 'filters' | 'query'
  > {
  datasourceMap: DatasourceMap;
  visualizationMap: VisualizationMap;
  currentDoc?: LensDocument;
  adHocDataViews?: DataViewSpec[];
}

// This approximate Lens workspace dimensions ratio on a typical widescreen
export const DEFAULT_LENS_LAYOUT_DIMENSIONS = {
  width: 1793,
  // this is a magic number from the reporting tool implementation
  // see: x-pack/platform/plugins/shared/screenshotting/server/browsers/chromium/driver_factory/index.ts#L146
  height: 1086,
};

function getShareURLForSavedObject(
  { application, data }: Pick<LensAppServices, 'application' | 'data'>,
  currentDoc?: LensDocument
) {
  return new URL(
    `${application.getUrlForApp('lens', { absolute: true })}${
      currentDoc?.savedObjectId
        ? getEditPath(
            currentDoc?.savedObjectId,
            data.query.timefilter.timefilter.getTime(),
            data.query.filterManager.getGlobalFilters(),
            data.query.timefilter.timefilter.getRefreshInterval()
          )
        : ''
    }`
  );
}

export function getLocatorParams(
  data: LensAppServices['data'],
  {
    filters,
    query,
    activeDatasourceId,
    datasourceStates,
    datasourceMap,
    visualizationMap,
    visualization,
    adHocDataViews,
    currentDoc,
  }: ShareableConfiguration,
  isDirty: boolean
) {
  const references = extractReferencesFromState({
    activeDatasourceId,
    activeDatasources: Object.keys(datasourceStates).reduce(
      (acc, datasourceId) => ({
        ...acc,
        [datasourceId]: datasourceMap[datasourceId],
      }),
      {}
    ),
    datasourceStates,
    visualizationState: visualization.state,
    activeVisualization: visualization.activeId
      ? visualizationMap[visualization.activeId]
      : undefined,
  }) as Array<Reference & SerializableRecord>;

  const serializableVisualization = visualization as LensAppState['visualization'] &
    SerializableRecord;

  const serializableDatasourceStates = datasourceStates as LensAppState['datasourceStates'] &
    SerializableRecord;

  const snapshotParams: LensAppLocatorParams = {
    filters,
    query,
    resolvedDateRange: getResolvedDateRange(data.query.timefilter.timefilter),
    visualization: serializableVisualization,
    datasourceStates: serializableDatasourceStates,
    activeDatasourceId,
    searchSessionId: data.search.session.getSessionId(),
    references,
    dataViewSpecs: adHocDataViews,
  };

  return {
    shareURL: snapshotParams,
    // for reporting use the shorten version when available
    reporting:
      currentDoc?.savedObjectId && !isDirty
        ? {
            filters,
            query,
            resolvedDateRange: getResolvedDateRange(data.query.timefilter.timefilter),
            savedObjectId: currentDoc?.savedObjectId,
          }
        : snapshotParams,
  };
}

export function getShareURL(
  shortUrlService: (params: LensAppLocatorParams) => Promise<string>,
  shareLocatorParams: LensAppLocatorParams,
  services: Pick<LensAppServices, 'application' | 'data'>,
  configuration: ShareableConfiguration,
  shareUrlEnabled: boolean
) {
  return {
    shareableUrl: shareUrlEnabled ? shortUrlService(shareLocatorParams) : undefined,
    savedObjectURL: getShareURLForSavedObject(services, configuration.currentDoc),
  };
}
