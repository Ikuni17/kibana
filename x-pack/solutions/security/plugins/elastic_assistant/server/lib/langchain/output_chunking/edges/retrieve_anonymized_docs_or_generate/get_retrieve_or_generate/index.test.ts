/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mockAnonymizedAlerts } from '../../../../../attack_discovery/evaluation/__mocks__/mock_anonymized_alerts';
import { getRetrieveOrGenerate } from '.';

describe('getRetrieveOrGenerate', () => {
  it("returns 'retrieve_anonymized_docs' when anonymizedDocs is empty", () => {
    expect(getRetrieveOrGenerate([])).toBe('retrieve_anonymized_docs');
  });

  it("returns 'generate' when anonymizedDocs is not empty", () => {
    expect(getRetrieveOrGenerate(mockAnonymizedAlerts)).toBe('generate');
  });
});
