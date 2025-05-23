/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AsApiContract, RewriteRequestCase, ActionType } from '@kbn/actions-types';

const transformConnectorType: RewriteRequestCase<ActionType> = ({
  enabled_in_config: enabledInConfig,
  enabled_in_license: enabledInLicense,
  minimum_license_required: minimumLicenseRequired,
  supported_feature_ids: supportedFeatureIds,
  is_system_action_type: isSystemActionType,
  sub_feature: subFeature,
  ...res
}: AsApiContract<ActionType>) => ({
  enabledInConfig,
  enabledInLicense,
  minimumLicenseRequired,
  supportedFeatureIds,
  isSystemActionType,
  subFeature,
  ...res,
});

export const transformConnectorTypesResponse = (
  results: Array<AsApiContract<ActionType>>
): ActionType[] => {
  return results.map((item) => transformConnectorType(item));
};
