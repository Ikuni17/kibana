/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useKibanaServices } from '../use_kibana';

export const useConnectorTypes = () => {
  const { contentConnectors } = useKibanaServices();

  return contentConnectors?.getConnectorTypes() || [];
};
