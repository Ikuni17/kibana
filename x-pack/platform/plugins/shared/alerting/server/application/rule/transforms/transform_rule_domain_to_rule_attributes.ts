/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { RawRule } from '../../../types';
import type { RuleDomain } from '../types';
import { getMappedParams } from '../../../rules_client/common';
import type { DenormalizedAction, DenormalizedArtifacts } from '../../../rules_client';

interface TransformRuleToEsParams {
  legacyId: RawRule['legacyId'];
  paramsWithRefs: RawRule['params'];
  meta?: RawRule['meta'];
}

export const transformRuleDomainToRuleAttributes = ({
  actionsWithRefs,
  artifactsWithRefs,
  rule,
  params,
}: {
  actionsWithRefs: DenormalizedAction[];
  artifactsWithRefs: DenormalizedArtifacts;
  rule: Omit<RuleDomain, 'actions' | 'params' | 'systemActions'>;
  params: TransformRuleToEsParams;
}): RawRule => {
  const { legacyId, paramsWithRefs, meta } = params;
  const mappedParams = getMappedParams(paramsWithRefs);

  return {
    name: rule.name,
    tags: rule.tags,
    enabled: rule.enabled,
    alertTypeId: rule.alertTypeId,
    consumer: rule.consumer,
    legacyId,
    schedule: rule.schedule,
    actions: actionsWithRefs,
    params: paramsWithRefs,
    ...(Object.keys(mappedParams).length ? { mapped_params: mappedParams } : {}),
    ...(rule.scheduledTaskId !== undefined ? { scheduledTaskId: rule.scheduledTaskId } : {}),
    createdBy: rule.createdBy,
    updatedBy: rule.updatedBy,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
    apiKey: rule.apiKey,
    apiKeyOwner: rule.apiKeyOwner,
    ...(rule.apiKeyCreatedByUser !== undefined
      ? { apiKeyCreatedByUser: rule.apiKeyCreatedByUser }
      : {}),
    ...(rule.throttle !== undefined ? { throttle: rule.throttle } : {}),
    ...(rule.notifyWhen !== undefined ? { notifyWhen: rule.notifyWhen } : {}),
    muteAll: rule.muteAll,
    mutedInstanceIds: rule.mutedInstanceIds,
    ...(meta ? { meta } : {}),
    ...(rule.executionStatus
      ? {
          executionStatus: {
            status: rule.executionStatus.status,
            lastExecutionDate: rule.executionStatus.lastExecutionDate.toISOString(),
            ...(rule.executionStatus.lastDuration
              ? { lastDuration: rule.executionStatus.lastDuration }
              : {}),
            ...(rule.executionStatus.error !== undefined
              ? { error: rule.executionStatus.error }
              : {}),
            ...(rule.executionStatus.warning !== undefined
              ? { warning: rule.executionStatus.warning }
              : {}),
          },
        }
      : {}),
    ...(rule.monitoring ? { monitoring: rule.monitoring } : {}),
    ...(rule.snoozeSchedule ? { snoozeSchedule: rule.snoozeSchedule } : {}),
    ...(rule.isSnoozedUntil !== undefined
      ? { isSnoozedUntil: rule.isSnoozedUntil?.toISOString() || null }
      : {}),
    ...(rule.lastRun !== undefined ? { lastRun: rule.lastRun } : {}),
    ...(rule.nextRun !== undefined ? { nextRun: rule.nextRun?.toISOString() || null } : {}),
    revision: rule.revision,
    ...(rule.running !== undefined ? { running: rule.running } : {}),
    ...(rule.alertDelay !== undefined ? { alertDelay: rule.alertDelay } : {}),
    ...(rule.flapping !== undefined ? { flapping: rule.flapping } : {}),
    artifacts: artifactsWithRefs,
  } as RawRule;
};
