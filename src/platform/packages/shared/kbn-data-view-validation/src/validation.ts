/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  ILLEGAL_CHARACTERS_VISIBLE,
  CONTAINS_SPACES_KEY,
  ILLEGAL_CHARACTERS_KEY,
} from './constants';
import type { ValidationErrors } from './types';

function dataViewContainsSpaces(indexPattern: string): boolean {
  return indexPattern.includes(' ');
}

function findIllegalCharacters(indexPattern: string): string[] {
  const illegalCharacters = ILLEGAL_CHARACTERS_VISIBLE.reduce((chars: string[], char: string) => {
    if (indexPattern.includes(char)) {
      chars.push(char);
    }
    return chars;
  }, []);

  return illegalCharacters;
}

/**
 * Validate index pattern strings
 * @public
 * @param indexPattern string to validate
 * @returns errors object
 */

export function validateDataView(indexPattern: string): ValidationErrors {
  const errors: ValidationErrors = {};

  const illegalCharacters = findIllegalCharacters(indexPattern);

  if (illegalCharacters.length) {
    errors[ILLEGAL_CHARACTERS_KEY] = illegalCharacters;
  }

  if (dataViewContainsSpaces(indexPattern)) {
    errors[CONTAINS_SPACES_KEY] = true;
  }

  return errors;
}
