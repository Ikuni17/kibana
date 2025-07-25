/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RequestHandler } from '@kbn/core/server';
import { ensureUserHasAuthzToFilesForAction } from './utils';
import type { EndpointActionFileInfoParams } from '../../../../common/api/endpoint';
import { EndpointActionFileInfoSchema } from '../../../../common/api/endpoint';
import type { ResponseActionsClient } from '../../services';
import {
  getResponseActionsClient,
  NormalizedExternalConnectorClient,
  getActionAgentType,
} from '../../services';
import { ACTION_AGENT_FILE_INFO_ROUTE } from '../../../../common/endpoint/constants';
import type { EndpointAppContext } from '../../types';
import type {
  SecuritySolutionRequestHandlerContext,
  SecuritySolutionPluginRouter,
} from '../../../types';
import { withEndpointAuthz } from '../with_endpoint_authz';
import { errorHandler } from '../error_handler';
import type { ActionFileInfoApiResponse } from '../../../../common/endpoint/types';

export const getActionFileInfoRouteHandler = (
  endpointContext: EndpointAppContext
): RequestHandler<
  EndpointActionFileInfoParams,
  unknown,
  unknown,
  SecuritySolutionRequestHandlerContext
> => {
  const logger = endpointContext.logFactory.get('actionFileInfoRoute');

  return async (context, req, res) => {
    const spaceId = (await context.securitySolution).getSpaceId();
    const { action_id: requestActionId, file_id: fileId } = req.params;

    logger.debug(
      () =>
        `Retrieving info for response action ${requestActionId} file [${fileId}] in space [${spaceId}]`
    );

    const coreContext = await context.core;

    try {
      const esClient = coreContext.elasticsearch.client.asInternalUser;
      const { agentType } = await getActionAgentType(esClient, requestActionId);
      const user = coreContext.security.authc.getCurrentUser();
      const casesClient = await endpointContext.service.getCasesClient(req);
      const connectorActions = (await context.actions).getActionsClient();
      const responseActionsClient: ResponseActionsClient = getResponseActionsClient(agentType, {
        esClient,
        casesClient,
        spaceId,
        endpointService: endpointContext.service,
        username: user?.username || 'unknown',
        connectorActions: new NormalizedExternalConnectorClient(connectorActions, logger),
      });
      const response: ActionFileInfoApiResponse = {
        data: await responseActionsClient.getFileInfo(requestActionId, fileId),
      };

      return res.ok({ body: response });
    } catch (error) {
      return errorHandler(logger, res, error);
    }
  };
};

export const registerActionFileInfoRoute = (
  router: SecuritySolutionPluginRouter,
  endpointContext: EndpointAppContext
) => {
  router.versioned
    .get({
      access: 'public',
      path: ACTION_AGENT_FILE_INFO_ROUTE,
      security: {
        authz: {
          requiredPrivileges: ['securitySolution'],
        },
      },
      options: { authRequired: true },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: EndpointActionFileInfoSchema,
        },
      },
      withEndpointAuthz(
        { any: ['canWriteFileOperations', 'canWriteExecuteOperations', 'canGetRunningProcesses'] },
        endpointContext.logFactory.get('actionFileInfo'),
        getActionFileInfoRouteHandler(endpointContext),
        ensureUserHasAuthzToFilesForAction
      )
    );
};
