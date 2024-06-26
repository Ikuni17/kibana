/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FactoryQueryTypes } from '../../../../../common/search_strategy/security_solution';
import { UsersQueries } from '../../../../../common/search_strategy/security_solution/users';

import type { SecuritySolutionFactory } from '../types';
import { allUsers } from './all';
import { authentications } from './authentications';
import { managedUserDetails } from './managed_details';

import { observedUserDetails } from './observed_details';

export const usersFactory: Record<UsersQueries, SecuritySolutionFactory<FactoryQueryTypes>> = {
  [UsersQueries.observedDetails]: observedUserDetails,
  [UsersQueries.managedDetails]: managedUserDetails,
  [UsersQueries.users]: allUsers,
  [UsersQueries.authentications]: authentications,
};
