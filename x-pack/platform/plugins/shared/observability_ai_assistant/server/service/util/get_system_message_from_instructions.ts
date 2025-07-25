/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { compact, uniqBy } from 'lodash';
import { Instruction } from '../../../common/types';
import { withTokenBudget } from '../../../common/utils/with_token_budget';
import { InstructionOrCallback } from '../types';

export const USER_INSTRUCTIONS_HEADER = `## User instructions
          
What follows is a set of instructions provided by the user, please abide by them
as long as they don't conflict with anything you've been told so far:

`;

export function getSystemMessageFromInstructions({
  // application instructions registered by the functions. These will be displayed first
  applicationInstructions,

  // instructions provided by the user via the KB. These will be displayed after the application instructions and only if they fit within the token budget
  kbUserInstructions,

  // instructions provided by the user via the API. These will be displayed after the application instructions and only if they fit within the token budget
  apiUserInstructions,
  availableFunctionNames,
}: {
  applicationInstructions: InstructionOrCallback[];
  kbUserInstructions: Instruction[];
  apiUserInstructions: Instruction[];
  availableFunctionNames: string[];
}): string {
  const allApplicationInstructions = compact(
    applicationInstructions.flatMap((instruction) => {
      if (typeof instruction === 'function') {
        return instruction({ availableFunctionNames });
      }
      return instruction;
    })
  );

  // all api user instructions and KB instructions.
  // api instructions will be prioritized over Knowledge Base instructions if the id is the same
  const allUserInstructions = withTokenBudget(
    uniqBy([...apiUserInstructions, ...kbUserInstructions], (i) => i.id),
    1000
  );

  return [
    // application instructions
    ...allApplicationInstructions,

    // user instructions
    ...(allUserInstructions.length ? [USER_INSTRUCTIONS_HEADER, ...allUserInstructions] : []),
  ]

    .map((instruction) => {
      return typeof instruction === 'string' ? instruction : instruction.text;
    })
    .join('\n\n');
}
