/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import _ from 'lodash';

import type { RefreshInterval } from '@kbn/data-service-server';
import type { InputTimeRange } from '../types';

const valueOf = function (o: any) {
  if (o) return o.valueOf();
};

export function areRefreshIntervalsDifferent(rangeA: RefreshInterval, rangeB: RefreshInterval) {
  if (_.isObject(rangeA) && _.isObject(rangeB)) {
    if (
      valueOf(rangeA.value) !== valueOf(rangeB.value) ||
      valueOf(rangeA.pause) !== valueOf(rangeB.pause)
    ) {
      return true;
    }
  } else {
    return !_.isEqual(rangeA, rangeB);
  }

  return false;
}

export function areTimeRangesDifferent(rangeA: InputTimeRange, rangeB: InputTimeRange) {
  if (rangeA && rangeB && _.isObject(rangeA) && _.isObject(rangeB)) {
    if (
      valueOf(rangeA.to) !== valueOf(rangeB.to) ||
      valueOf(rangeA.from) !== valueOf(rangeB.from)
    ) {
      return true;
    }
  } else {
    return !_.isEqual(rangeA, rangeB);
  }

  return false;
}
