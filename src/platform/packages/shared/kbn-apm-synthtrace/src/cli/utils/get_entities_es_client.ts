/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Client, HttpConnection } from '@elastic/elasticsearch';
import { EntitiesSynthtraceEsClient } from '../../lib/entities/entities_synthtrace_es_client';
import { Logger } from '../../lib/utils/create_logger';
import { RunOptions } from './parse_run_cli_flags';
import { getEsClientTlsSettings } from './ssl';

export function getEntitiesEsClient({
  target,
  logger,
  concurrency,
}: Pick<RunOptions, 'concurrency'> & {
  target: string;
  logger: Logger;
}) {
  const client = new Client({
    node: target,
    tls: getEsClientTlsSettings(target),
    Connection: HttpConnection,
    requestTimeout: 30_000,
  });

  return new EntitiesSynthtraceEsClient({
    client,
    logger,
    concurrency,
    refreshAfterIndex: true,
  });
}
