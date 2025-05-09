/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { ToastInput, ToastOptions, ToastsStart } from '@kbn/core/public';
import { useMemo } from 'react';
import { extractErrorProperties, type ErrorType, MLRequestFailure } from '@kbn/ml-error-utils';
import { useNotifications } from '../../contexts/kibana';

export type ToastNotificationService = ReturnType<typeof toastNotificationServiceProvider>;

export function toastNotificationServiceProvider(toastNotifications: ToastsStart) {
  function displayDangerToast(toastOrTitle: ToastInput, options?: ToastOptions) {
    toastNotifications.addDanger(toastOrTitle, options);
  }

  function displayWarningToast(toastOrTitle: ToastInput, options?: ToastOptions) {
    toastNotifications.addWarning(toastOrTitle, options);
  }

  function displaySuccessToast(toastOrTitle: ToastInput, options?: ToastOptions) {
    toastNotifications.addSuccess(toastOrTitle, options);
  }

  function displayErrorToast(
    error: ErrorType,
    title?: string,
    toastLifeTimeMs?: number,
    toastMessage?: string
  ) {
    const errorObj = extractErrorProperties(error);
    toastNotifications.addError(new MLRequestFailure(errorObj, error), {
      title:
        title ??
        i18n.translate('xpack.ml.toastNotificationService.errorTitle', {
          defaultMessage: 'An error has occurred',
        }),
      ...(toastLifeTimeMs ? { toastLifeTimeMs } : {}),
      ...(toastMessage ? { toastMessage } : {}),
    });
  }

  return { displayDangerToast, displayWarningToast, displaySuccessToast, displayErrorToast };
}

/**
 * Hook to use {@link ToastNotificationService} in React components.
 */
export function useToastNotificationService(): ToastNotificationService {
  const { toasts } = useNotifications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => toastNotificationServiceProvider(toasts), []);
}
