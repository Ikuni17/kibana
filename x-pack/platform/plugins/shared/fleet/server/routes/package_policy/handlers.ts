/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';

import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { RequestHandler } from '@kbn/core/server';

import { groupBy, isEmpty, isEqual, keyBy } from 'lodash';

import { HTTPAuthorizationHeader } from '../../../common/http_authorization_header';

import { populatePackagePolicyAssignedAgentsCount } from '../../services/package_policies/populate_package_policy_assigned_agents_count';

import {
  agentPolicyService,
  appContextService,
  checkAllowedPackages,
  packagePolicyService,
} from '../../services';
import type {
  GetPackagePoliciesRequestSchema,
  GetOnePackagePolicyRequestSchema,
  CreatePackagePolicyRequestSchema,
  UpdatePackagePolicyRequestSchema,
  DeletePackagePoliciesRequestSchema,
  UpgradePackagePoliciesRequestSchema,
  DryRunPackagePoliciesRequestSchema,
  FleetRequestHandler,
  PackagePolicy,
  DeleteOnePackagePolicyRequestSchema,
  BulkGetPackagePoliciesRequestSchema,
  UpdatePackagePolicyRequestBodySchema,
} from '../../types';
import type {
  PostDeletePackagePoliciesResponse,
  NewPackagePolicy,
  UpgradePackagePolicyDryRunResponse,
  UpgradePackagePolicyResponse,
} from '../../../common/types';
import { installationStatuses, inputsFormat } from '../../../common/constants';
import {
  PackagePolicyNotFoundError,
  PackagePolicyRequestError,
  CustomPackagePolicyNotAllowedForAgentlessError,
} from '../../errors';
import {
  getInstallation,
  getInstallations,
  getPackageInfo,
  removeInstallation,
} from '../../services/epm/packages';
import { PACKAGES_SAVED_OBJECT_TYPE, SO_SEARCH_LIMIT } from '../../constants';
import {
  simplifiedPackagePolicytoNewPackagePolicy,
  packagePolicyToSimplifiedPackagePolicy,
} from '../../../common/services/simplified_package_policy_helper';

import type { SimplifiedPackagePolicy } from '../../../common/services/simplified_package_policy_helper';
import { runWithCache } from '../../services/epm/packages/cache';

import {
  isSimplifiedCreatePackagePolicyRequest,
  removeFieldsFromInputSchema,
  renameAgentlessAgentPolicy,
  alignInputsAndStreams,
} from './utils';

export const isNotNull = <T>(value: T | null): value is T => value !== null;

export const getPackagePoliciesHandler: FleetRequestHandler<
  undefined,
  TypeOf<typeof GetPackagePoliciesRequestSchema.query>
> = async (context, request, response) => {
  const esClient = (await context.core).elasticsearch.client.asInternalUser;
  const fleetContext = await context.fleet;
  const soClient = fleetContext.internalSoClient;
  const limitedToPackages = fleetContext.limitedToPackages;

  const { items, total, page, perPage } = await packagePolicyService.list(soClient, request.query);

  checkAllowedPackages(items, limitedToPackages, 'package.name');

  if (request.query.withAgentCount) {
    await populatePackagePolicyAssignedAgentsCount(esClient, items);
  }

  // agnostic to package-level RBAC
  return response.ok({
    body: {
      items:
        request.query.format === inputsFormat.Simplified
          ? items.map((item) => packagePolicyToSimplifiedPackagePolicy(item))
          : items,
      total,
      page,
      perPage,
    },
  });
};

export const bulkGetPackagePoliciesHandler: FleetRequestHandler<
  undefined,
  TypeOf<typeof BulkGetPackagePoliciesRequestSchema.query>,
  TypeOf<typeof BulkGetPackagePoliciesRequestSchema.body>
> = async (context, request, response) => {
  const fleetContext = await context.fleet;
  const soClient = fleetContext.internalSoClient;
  const limitedToPackages = fleetContext.limitedToPackages;
  const { ids, ignoreMissing } = request.body;

  try {
    const items = await packagePolicyService.getByIDs(soClient, ids, {
      ignoreMissing,
    });
    const responseItems = items ?? [];

    checkAllowedPackages(responseItems, limitedToPackages, 'package.name');

    return response.ok({
      body: {
        items:
          responseItems.length > 0 && request.query.format === inputsFormat.Simplified
            ? responseItems.map((item) => packagePolicyToSimplifiedPackagePolicy(item))
            : responseItems,
      },
    });
  } catch (error) {
    if (error instanceof PackagePolicyNotFoundError) {
      return response.notFound({
        body: { message: error.message },
      });
    }

    throw error;
  }
};

export const getOnePackagePolicyHandler: FleetRequestHandler<
  TypeOf<typeof GetOnePackagePolicyRequestSchema.params>,
  TypeOf<typeof GetOnePackagePolicyRequestSchema.query>
> = async (context, request, response) => {
  const fleetContext = await context.fleet;
  const soClient = fleetContext.internalSoClient;
  const limitedToPackages = fleetContext.limitedToPackages;
  const { packagePolicyId } = request.params;
  const notFoundResponse = () =>
    response.notFound({ body: { message: `Package policy ${packagePolicyId} not found` } });

  try {
    const packagePolicy = await packagePolicyService.get(soClient, packagePolicyId);

    if (packagePolicy) {
      checkAllowedPackages([packagePolicy], limitedToPackages, 'package.name');

      return response.ok({
        body: {
          item:
            request.query.format === inputsFormat.Simplified
              ? packagePolicyToSimplifiedPackagePolicy(packagePolicy)
              : packagePolicy,
        },
      });
    } else {
      return notFoundResponse();
    }
  } catch (error) {
    if (SavedObjectsErrorHelpers.isNotFoundError(error)) {
      return notFoundResponse();
    }
    throw error;
  }
};

export const getOrphanedPackagePolicies: RequestHandler<undefined, undefined> = async (
  context,
  request,
  response
) => {
  const soClient = (await context.core).savedObjects.client;

  const installedPackages = await getInstallations(soClient, {
    perPage: SO_SEARCH_LIMIT,
    filter: `
        ${PACKAGES_SAVED_OBJECT_TYPE}.attributes.install_status:${installationStatuses.Installed}
    `,
  });
  const orphanedPackagePolicies: PackagePolicy[] = [];
  const packagePolicies = await packagePolicyService.list(soClient, {
    perPage: SO_SEARCH_LIMIT,
  });
  const packagePoliciesByPackage = groupBy(packagePolicies.items, 'package.name');
  const agentPolicies = await agentPolicyService.list(soClient, {
    perPage: SO_SEARCH_LIMIT,
  });
  const agentPoliciesById = keyBy(agentPolicies.items, 'id');
  const usedPackages = installedPackages.saved_objects.filter(
    ({ attributes: { name } }) => !!packagePoliciesByPackage[name]
  );
  usedPackages.forEach(({ attributes: { name } }) => {
    packagePoliciesByPackage[name].forEach((packagePolicy) => {
      if (packagePolicy.policy_ids.every((policyId) => !agentPoliciesById[policyId])) {
        orphanedPackagePolicies.push(packagePolicy);
      }
    });
  });

  return response.ok({
    body: {
      items: orphanedPackagePolicies,
      total: orphanedPackagePolicies.length,
    },
  });
};

export const createPackagePolicyHandler: FleetRequestHandler<
  undefined,
  TypeOf<typeof CreatePackagePolicyRequestSchema.query>,
  TypeOf<typeof CreatePackagePolicyRequestSchema.body>
> = async (context, request, response) => {
  const coreContext = await context.core;
  const fleetContext = await context.fleet;
  const soClient = fleetContext.internalSoClient;
  const esClient = coreContext.elasticsearch.client.asInternalUser;
  const user = appContextService.getSecurityCore().authc.getCurrentUser(request) || undefined;
  const { force, id, package: pkg, ...newPolicy } = request.body;
  if ('spaceIds' in newPolicy) {
    delete newPolicy.spaceIds;
  }
  const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest(request, user?.username);
  let wasPackageAlreadyInstalled = false;

  const spaceId = fleetContext.spaceId;
  try {
    let newPackagePolicy: NewPackagePolicy;
    if (isSimplifiedCreatePackagePolicyRequest(newPolicy)) {
      if (!pkg) {
        throw new PackagePolicyRequestError('Package is required');
      }
      const pkgInfo = await getPackageInfo({
        savedObjectsClient: soClient,
        pkgName: pkg.name,
        pkgVersion: pkg.version,
        ignoreUnverified: force,
        prerelease: true,
      });
      newPackagePolicy = simplifiedPackagePolicytoNewPackagePolicy(newPolicy, pkgInfo, {
        experimental_data_stream_features: pkg.experimental_data_stream_features,
      });
    } else {
      newPackagePolicy = await packagePolicyService.enrichPolicyWithDefaultsFromPackage(soClient, {
        ...newPolicy,
        package: pkg,
      } as NewPackagePolicy);
    }
    newPackagePolicy.inputs = alignInputsAndStreams(newPackagePolicy.inputs);

    const installation = await getInstallation({
      savedObjectsClient: soClient,
      pkgName: pkg!.name,
    });

    wasPackageAlreadyInstalled = installation?.install_status === 'installed';

    // Create package policy
    const packagePolicy = await fleetContext.packagePolicyService.asCurrentUser.create(
      soClient,
      esClient,
      newPackagePolicy,
      {
        id,
        force,
        spaceId,
        authorizationHeader,
      },
      context,
      request
    );

    return response.ok({
      body: {
        item:
          request.query.format === inputsFormat.Simplified
            ? packagePolicyToSimplifiedPackagePolicy(packagePolicy)
            : packagePolicy,
      },
    });
  } catch (error) {
    appContextService
      .getLogger()
      .error(`Error while creating package policy due to error: ${error.message}`, { error });
    if (!wasPackageAlreadyInstalled) {
      const installation = await getInstallation({
        savedObjectsClient: soClient,
        pkgName: pkg!.name,
      });
      if (installation) {
        appContextService
          .getLogger()
          .info(`rollback ${pkg!.name}-${pkg!.version} package installation after error`);
        await removeInstallation({
          savedObjectsClient: soClient,
          pkgName: pkg!.name,
          pkgVersion: pkg!.version,
          esClient,
        });
      }
    }

    if (error instanceof CustomPackagePolicyNotAllowedForAgentlessError) {
      // Agentless deployments have 1:1 agent to integration policies
      // We delete the associated agent policy previously created.
      const agentPolicyId = newPolicy.policy_ids?.[0];

      if (agentPolicyId) {
        appContextService
          .getLogger()
          .info(
            `Deleting agent policy ${agentPolicyId}, associated with custom integration not allowed for agentless deployment`
          );

        await agentPolicyService.delete(soClient, esClient, agentPolicyId).catch(() => {
          appContextService
            .getLogger()
            .error(
              `Failed to delete agent policy ${agentPolicyId}, associated with custom integration not allowed for agentless deployment`
            );
        });
      }
      throw error;
    }

    if (error.statusCode) {
      return response.customError({
        statusCode: error.statusCode,
        body: { message: error.message },
      });
    }
    throw error;
  }
};

export const updatePackagePolicyHandler: FleetRequestHandler<
  TypeOf<typeof UpdatePackagePolicyRequestSchema.params>,
  TypeOf<typeof UpdatePackagePolicyRequestSchema.query>,
  TypeOf<typeof UpdatePackagePolicyRequestSchema.body>
> = async (context, request, response) => {
  const coreContext = await context.core;
  const fleetContext = await context.fleet;
  const soClient = fleetContext.internalSoClient;
  const limitedToPackages = fleetContext.limitedToPackages;
  const esClient = coreContext.elasticsearch.client.asInternalUser;
  const user = appContextService.getSecurityCore().authc.getCurrentUser(request) || undefined;
  const packagePolicy = await packagePolicyService.get(soClient, request.params.packagePolicyId);

  if (!packagePolicy) {
    throw new PackagePolicyNotFoundError('Package policy not found');
  }

  if (limitedToPackages && limitedToPackages.length) {
    const packageName = packagePolicy?.package?.name;
    if (packageName && !limitedToPackages.includes(packageName)) {
      return response.forbidden({
        body: { message: `Update for package name ${packageName} is not authorized.` },
      });
    }
  }

  try {
    // simplified request
    const { force, package: pkg, ...body } = request.body;
    let newData: NewPackagePolicy;

    if (
      body.inputs &&
      isSimplifiedCreatePackagePolicyRequest(body as unknown as SimplifiedPackagePolicy)
    ) {
      if (!pkg) {
        throw new PackagePolicyRequestError('Package is required');
      }
      const pkgInfo = await getPackageInfo({
        savedObjectsClient: soClient,
        pkgName: pkg.name,
        pkgVersion: pkg.version,
      });

      newData = simplifiedPackagePolicytoNewPackagePolicy(
        body as unknown as SimplifiedPackagePolicy,
        pkgInfo,
        { experimental_data_stream_features: pkg.experimental_data_stream_features }
      );
    } else {
      // complete request
      const { overrides, ...restOfBody } = body as TypeOf<
        typeof UpdatePackagePolicyRequestBodySchema
      >;
      const packagePolicyInputs = removeFieldsFromInputSchema(packagePolicy.inputs);

      // listing down accepted properties, because loaded packagePolicy contains some that are not accepted in update
      newData = {
        ...restOfBody,
        name: restOfBody.name ?? packagePolicy.name,
        description: restOfBody.description ?? packagePolicy.description,
        namespace: restOfBody.namespace ?? packagePolicy?.namespace,
        policy_id:
          restOfBody.policy_id === undefined ? packagePolicy.policy_id : restOfBody.policy_id,
        enabled:
          'enabled' in restOfBody
            ? restOfBody.enabled ?? packagePolicy.enabled
            : packagePolicy.enabled,
        package: pkg ?? packagePolicy.package,
        inputs: restOfBody.inputs ?? packagePolicyInputs,
        vars: restOfBody.vars ?? packagePolicy.vars,
        supports_agentless: restOfBody.supports_agentless ?? packagePolicy.supports_agentless,
      } as NewPackagePolicy;

      if (overrides) {
        newData.overrides = overrides;
      }
    }

    newData.inputs = alignInputsAndStreams(newData.inputs);

    if (
      newData.policy_ids &&
      !isEmpty(packagePolicy.policy_ids) &&
      !isEqual(newData.policy_ids, packagePolicy.policy_ids)
    ) {
      const agentPolicy = await agentPolicyService.get(soClient, packagePolicy.policy_ids[0]);
      if (agentPolicy?.supports_agentless) {
        throw new PackagePolicyRequestError(
          'Cannot change agent policies of an agentless integration'
        );
      }
    }

    await renameAgentlessAgentPolicy(soClient, esClient, packagePolicy, newData.name);

    const updatedPackagePolicy = await packagePolicyService.update(
      soClient,
      esClient,
      request.params.packagePolicyId,
      newData,
      { user, force },
      packagePolicy.package?.version
    );
    return response.ok({
      body: {
        item:
          request.query.format === inputsFormat.Simplified
            ? packagePolicyToSimplifiedPackagePolicy(updatedPackagePolicy)
            : updatedPackagePolicy,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return response.customError({
        statusCode: error.statusCode,
        body: { message: error.message },
      });
    }
    throw error;
  }
};

export const deletePackagePolicyHandler: RequestHandler<
  unknown,
  unknown,
  TypeOf<typeof DeletePackagePoliciesRequestSchema.body>
> = async (context, request, response) => {
  const coreContext = await context.core;
  const soClient = coreContext.savedObjects.client;
  const esClient = coreContext.elasticsearch.client.asInternalUser;
  const user = appContextService.getSecurityCore().authc.getCurrentUser(request) || undefined;

  const body: PostDeletePackagePoliciesResponse = await packagePolicyService.delete(
    soClient,
    esClient,
    request.body.packagePolicyIds,
    { user, force: request.body.force, skipUnassignFromAgentPolicies: request.body.force },
    context,
    request
  );

  return response.ok({
    body,
  });
};

export const deleteOnePackagePolicyHandler: RequestHandler<
  TypeOf<typeof DeleteOnePackagePolicyRequestSchema.params>,
  TypeOf<typeof DeleteOnePackagePolicyRequestSchema.query>,
  unknown
> = async (context, request, response) => {
  const coreContext = await context.core;
  const soClient = coreContext.savedObjects.client;
  const esClient = coreContext.elasticsearch.client.asInternalUser;
  const user = appContextService.getSecurityCore().authc.getCurrentUser(request) || undefined;

  const res = await packagePolicyService.delete(
    soClient,
    esClient,
    [request.params.packagePolicyId],
    { user, force: request.query.force, skipUnassignFromAgentPolicies: request.query.force },
    context,
    request
  );

  if (
    res[0] &&
    res[0].success === false &&
    res[0].statusCode !== 404 // ignore 404 to allow that call to be idempotent
  ) {
    return response.customError({
      statusCode: res[0].statusCode ?? 500,
      body: res[0].body,
    });
  }

  return response.ok({
    body: { id: request.params.packagePolicyId },
  });
};

export const upgradePackagePolicyHandler: RequestHandler<
  unknown,
  unknown,
  TypeOf<typeof UpgradePackagePoliciesRequestSchema.body>
> = async (context, request, response) => {
  const coreContext = await context.core;
  const soClient = coreContext.savedObjects.client;
  const esClient = coreContext.elasticsearch.client.asInternalUser;
  const user = appContextService.getSecurityCore().authc.getCurrentUser(request) || undefined;
  const body: UpgradePackagePolicyResponse = await packagePolicyService.bulkUpgrade(
    soClient,
    esClient,
    request.body.packagePolicyIds,
    { user }
  );

  const firstFatalError = body.find((item) => item.statusCode && item.statusCode !== 200);

  if (firstFatalError) {
    return response.customError({
      statusCode: firstFatalError.statusCode!,
      body: { message: firstFatalError.body!.message },
    });
  }
  return response.ok({
    body,
  });
};

export const dryRunUpgradePackagePolicyHandler: RequestHandler<
  unknown,
  unknown,
  TypeOf<typeof DryRunPackagePoliciesRequestSchema.body>
> = async (context, request, response) => {
  const soClient = (await context.core).savedObjects.client;

  const body: UpgradePackagePolicyDryRunResponse = [];
  const { packagePolicyIds } = request.body;
  await runWithCache(async () => {
    for (const id of packagePolicyIds) {
      const result = await packagePolicyService.getUpgradeDryRunDiff(soClient, id);
      body.push(result);
    }
  });

  const firstFatalError = body.find((item) => item.statusCode && item.statusCode !== 200);

  if (firstFatalError) {
    return response.customError({
      statusCode: firstFatalError.statusCode!,
      body: { message: firstFatalError.body!.message },
    });
  }

  return response.ok({
    body,
  });
};
