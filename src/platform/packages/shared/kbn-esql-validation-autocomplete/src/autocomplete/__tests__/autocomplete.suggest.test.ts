/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ESQLCallbacks } from '../../shared/types';
import * as autocomplete from '../autocomplete';
import { getCallbackMocks } from '../../__tests__/helpers';

const setup = async (caret = '?') => {
  if (caret.length !== 1) throw new Error('Caret must be a single character');
  const callbacks = getCallbackMocks();
  const suggest = async (query: string, cb: ESQLCallbacks = callbacks) => {
    const pos = query.indexOf(caret);
    if (pos < 0) throw new Error(`User cursor/caret "${caret}" not found in query: ${query}`);
    const querySansCaret = query.slice(0, pos) + query.slice(pos + 1);
    return await autocomplete.suggest(querySansCaret, pos, cb);
  };

  return {
    callbacks,
    suggest,
  };
};

describe('autocomplete.suggest', () => {
  test('does not load fields when suggesting within a single  SHOW, ROW command', async () => {
    const { suggest, callbacks } = await setup();

    await suggest('sHoW ?');
    await suggest('row ? |');

    expect((callbacks.getColumnsFor as any).mock.calls.length).toBe(0);
  });
});
