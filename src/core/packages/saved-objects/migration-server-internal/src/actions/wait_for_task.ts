/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import * as Either from 'fp-ts/Either';
import * as TaskEither from 'fp-ts/TaskEither';
import * as Option from 'fp-ts/Option';
import { errors as EsErrors } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import {
  catchRetryableEsClientErrors,
  type RetryableEsClientError,
} from './catch_retryable_es_client_errors';

/** @internal */
export interface WaitForTaskResponse {
  error: Option.Option<{ type: string; reason?: string | null; index?: string }>;
  completed: boolean;
  failures: Option.Option<any[]>;
  description?: string;
  response?: estypes.TasksGetResponse['response'];
}

/**
 * After waiting for the specified timeout, the task has not yet completed.
 *
 * When querying the tasks API we use `wait_for_completion=true` to block the
 * request until the task completes. If after the `timeout`, the task still has
 * not completed we return this error. This does not mean that the task itelf
 * has reached a timeout, Elasticsearch will continue to run the task.
 */
export interface WaitForTaskCompletionTimeout {
  /** After waiting for the specified timeout, the task has not yet completed. */
  readonly type: 'wait_for_task_completion_timeout';
  readonly message: string;
  readonly error?: Error;
}

/**
 * When we use `wait_for_completion=false`, we won't get the errors right away, we'll get a
 * task id. Then we have to query the tasks API with that id and Elasticsearch will tell us
 * if there was any error in the original task inside a 200 response. In some cases we might
 * want to retry the original task.
 */
export interface TaskCompletedWithRetriableError {
  /** While waiting, the original task encountered an error. It might need to be retried. */
  readonly type: 'task_completed_with_retriable_error';
  readonly message: string;
  readonly error?: Error;
}

const catchWaitForTaskCompletionTimeout = (
  e: EsErrors.ResponseError
): Either.Either<WaitForTaskCompletionTimeout, never> => {
  if (
    e.body?.error?.type === 'timeout_exception' ||
    e.body?.error?.type === 'receive_timeout_transport_exception'
  ) {
    return Either.left({
      type: 'wait_for_task_completion_timeout' as const,
      message: `[${e.body.error.type}] ${e.body.error.reason}`,
      error: e,
    });
  } else {
    throw e;
  }
};

/** @internal */
export interface WaitForTaskParams {
  client: ElasticsearchClient;
  taskId: string;
  timeout: string;
}
/**
 * Blocks for up to 60s or until a task completes.
 *
 * TODO: delete completed tasks
 */
export const waitForTask =
  ({
    client,
    taskId,
    timeout,
  }: WaitForTaskParams): TaskEither.TaskEither<
    RetryableEsClientError | WaitForTaskCompletionTimeout,
    WaitForTaskResponse
  > =>
  () => {
    return client.tasks
      .get({
        task_id: taskId,
        wait_for_completion: true,
        timeout,
      })
      .then((body) => {
        const failures = body.response?.failures ?? [];
        return Either.right({
          completed: body.completed,
          error: Option.fromNullable(body.error as estypes.ErrorCauseKeys),
          failures: failures.length > 0 ? Option.some(failures) : Option.none,
          description: body.task.description,
          response: body.response,
        });
      })
      .catch(catchWaitForTaskCompletionTimeout)
      .catch(catchRetryableEsClientErrors);
  };
