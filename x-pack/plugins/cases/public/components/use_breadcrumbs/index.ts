/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { ChromeBreadcrumb } from '@kbn/core/public';
import { useCallback, useEffect } from 'react';
import { KibanaServices, useKibana, useNavigation } from '../../common/lib/kibana';
import type { ICasesDeepLinkId } from '../../common/navigation';
import { CasesDeepLinkId } from '../../common/navigation';
import { useApplication } from '../../common/lib/kibana/use_application';

const casesBreadcrumbTitle: Record<ICasesDeepLinkId, string> = {
  [CasesDeepLinkId.cases]: i18n.translate('xpack.cases.breadcrumbs.all_cases', {
    defaultMessage: 'Cases',
  }),
  [CasesDeepLinkId.casesCreate]: i18n.translate('xpack.cases.breadcrumbs.create_case', {
    defaultMessage: 'Create',
  }),
  [CasesDeepLinkId.casesConfigure]: i18n.translate('xpack.cases.breadcrumbs.settings', {
    defaultMessage: 'Settings',
  }),
};

function getTitleFromBreadcrumbs(breadcrumbs: ChromeBreadcrumb[]): string[] {
  return breadcrumbs.map(({ text }) => text?.toString() ?? '').reverse();
}

const useApplyBreadcrumbs = () => {
  const {
    chrome: { docTitle, setBreadcrumbs },
    application: { navigateToUrl },
  } = useKibana().services;
  return useCallback(
    (breadcrumbs: ChromeBreadcrumb[]) => {
      docTitle.change(getTitleFromBreadcrumbs(breadcrumbs));
      setBreadcrumbs(
        breadcrumbs.map((breadcrumb) => {
          const { href, onClick } = breadcrumb;
          return {
            ...breadcrumb,
            ...(href && !onClick
              ? {
                  onClick: (event) => {
                    if (event) {
                      event.preventDefault();
                    }
                    navigateToUrl(href);
                  },
                }
              : {}),
          };
        })
      );
    },
    [docTitle, setBreadcrumbs, navigateToUrl]
  );
};

export const useCasesBreadcrumbs = (pageDeepLink: ICasesDeepLinkId) => {
  const { appId, appTitle } = useApplication();
  const { getAppUrl } = useNavigation(appId);
  const applyBreadcrumbs = useApplyBreadcrumbs();

  useEffect(() => {
    applyBreadcrumbs([
      { text: appTitle, href: getAppUrl() },
      {
        text: casesBreadcrumbTitle[CasesDeepLinkId.cases],
        ...(pageDeepLink !== CasesDeepLinkId.cases
          ? {
              href: getAppUrl({ deepLinkId: CasesDeepLinkId.cases }),
            }
          : {}),
      },
      ...(pageDeepLink !== CasesDeepLinkId.cases
        ? [
            {
              text: casesBreadcrumbTitle[pageDeepLink],
            },
          ]
        : []),
    ]);
    KibanaServices.get().serverless?.setBreadcrumbs([]);
  }, [pageDeepLink, appTitle, getAppUrl, applyBreadcrumbs]);
};

export const useCasesTitleBreadcrumbs = (caseTitle: string) => {
  const { appId, appTitle } = useApplication();
  const { getAppUrl } = useNavigation(appId);
  const applyBreadcrumbs = useApplyBreadcrumbs();

  useEffect(() => {
    const titleBreadcrumb: ChromeBreadcrumb = {
      text: caseTitle,
    };
    const casesBreadcrumbs: ChromeBreadcrumb[] = [
      { text: appTitle, href: getAppUrl() },
      {
        text: casesBreadcrumbTitle[CasesDeepLinkId.cases],
        href: getAppUrl({ deepLinkId: CasesDeepLinkId.cases }),
      },
      titleBreadcrumb,
    ];
    applyBreadcrumbs(casesBreadcrumbs);
    KibanaServices.get().serverless?.setBreadcrumbs([titleBreadcrumb]);
  }, [caseTitle, appTitle, getAppUrl, applyBreadcrumbs]);
};
