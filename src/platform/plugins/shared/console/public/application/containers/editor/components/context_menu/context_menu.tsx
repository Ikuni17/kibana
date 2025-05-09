/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState, useEffect } from 'react';
import {
  EuiButtonIcon,
  EuiContextMenuPanel,
  EuiContextMenuItem,
  EuiPopover,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiLoadingSpinner,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { NotificationsStart } from '@kbn/core/public';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { LanguageSelectorModal } from './language_selector_modal';
import { convertRequestToLanguage } from '../../../../../services';
import type { EditorRequest } from '../../types';

import { useServicesContext } from '../../../../contexts';
import { StorageKeys } from '../../../../../services';
import {
  DEFAULT_LANGUAGE,
  AVAILABLE_LANGUAGES,
  KIBANA_API_PREFIX,
} from '../../../../../../common/constants';

interface Props {
  getRequests: () => Promise<EditorRequest[]>;
  getDocumentation: () => Promise<string | null>;
  autoIndent: (ev: React.MouseEvent) => void;
  notifications: Pick<NotificationsStart, 'toasts'>;
  /* A function that returns true if any of the selected requests is an internal Kibana request
   * (starting with the kbn: prefix). This is needed here as we display only the curl language
   * for internal Kibana requests since the other languages are not supported yet. */
  getIsKbnRequestSelected: () => Promise<boolean | null>;
}

const styles = {
  // Remove the default underline on hover for the context menu items since it
  // will also be applied to the language selector button, and apply it only to
  // the text in the context menu item.
  button: css`
    &:hover {
      text-decoration: none !important;
      .languageSelector {
        text-decoration: underline;
      }
    }
  `,
};

const DELAY_FOR_HIDING_SPINNER = 500;

const getLanguageLabelByValue = (value: string) => {
  return AVAILABLE_LANGUAGES.find((lang) => lang.value === value)?.label || DEFAULT_LANGUAGE;
};

export const ContextMenu = ({
  getRequests,
  getDocumentation,
  autoIndent,
  notifications,
  getIsKbnRequestSelected,
}: Props) => {
  // Get default language from local storage
  const {
    services: { storage, esHostService },
  } = useServicesContext();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isRequestConverterLoading, setRequestConverterLoading] = useState(false);
  const [isLanguageSelectorVisible, setLanguageSelectorVisibility] = useState(false);
  const [isKbnRequestSelected, setIsKbnRequestSelected] = useState<boolean | null>(null);
  const [defaultLanguage, setDefaultLanguage] = useState(
    storage.get(StorageKeys.DEFAULT_LANGUAGE, DEFAULT_LANGUAGE)
  );
  const [currentLanguage, setCurrentLanguage] = useState(defaultLanguage);

  useEffect(() => {
    if (isKbnRequestSelected) {
      setCurrentLanguage(DEFAULT_LANGUAGE);
    } else {
      setCurrentLanguage(defaultLanguage);
    }
  }, [defaultLanguage, isKbnRequestSelected]);

  const copyText = async (text: string) => {
    if (window.navigator?.clipboard) {
      await window.navigator.clipboard.writeText(text);
      return;
    }
    throw new Error('Could not copy to clipboard!');
  };

  // This function will convert all the selected requests to the language by
  // calling convertRequestToLanguage and then copy the data to clipboard.
  const copyAs = async (language?: string) => {
    // Get the language we want to convert the requests to
    const withLanguage = language || currentLanguage;
    // Get all the selected requests
    const requests = await getRequests();

    // If we have any kbn requests, we should not allow the user to copy as
    // anything other than curl
    const hasKbnRequests = requests.some((req) => req.url.startsWith(KIBANA_API_PREFIX));

    if (hasKbnRequests && withLanguage !== 'curl') {
      notifications.toasts.addDanger({
        title: i18n.translate('console.consoleMenu.copyAsMixedRequestsMessage', {
          defaultMessage: 'Kibana requests can only be copied as curl',
        }),
      });

      return;
    }

    const { data: requestsAsCode, error: requestError } = await convertRequestToLanguage({
      language: withLanguage,
      esHost: esHostService.getHost(),
      kibanaHost: window.location.origin,
      requests,
    });

    if (requestError) {
      notifications.toasts.addDanger({
        title: i18n.translate('console.consoleMenu.copyAsFailedMessage', {
          defaultMessage:
            '{requestsCount, plural, one {Request} other {Requests}} could not be copied to clipboard',
          values: { requestsCount: requests.length },
        }),
      });

      return;
    }

    notifications.toasts.addSuccess({
      title: i18n.translate('console.consoleMenu.copyAsSuccessMessage', {
        defaultMessage:
          '{requestsCount, plural, one {Request} other {Requests}} copied to clipboard as {language}',
        values: { language: getLanguageLabelByValue(withLanguage), requestsCount: requests.length },
      }),
    });

    await copyText(requestsAsCode);
  };

  const checkIsKbnRequestSelected = async () => {
    setIsKbnRequestSelected(await getIsKbnRequestSelected());
  };

  const onCopyAsSubmit = async (language?: string) => {
    const withLanguage = language || currentLanguage;

    // Close language selector modal
    setLanguageSelectorVisibility(false);
    // Show loading spinner
    setRequestConverterLoading(true);

    // When copying as worked as expected, close the context menu popover
    copyAs(withLanguage)
      .then(() => {
        setIsPopoverOpen(false);
      })
      .finally(() => {
        // Delay hiding the spinner to avoid flickering between the spinner and
        // the change language button
        setTimeout(() => {
          setRequestConverterLoading(false);
        }, DELAY_FOR_HIDING_SPINNER);
      });
  };

  const changeDefaultLanguage = (language: string) => {
    if (currentLanguage !== language) {
      storage.set(StorageKeys.DEFAULT_LANGUAGE, language);
    }

    setDefaultLanguage(language);
    if (!isKbnRequestSelected) {
      setCurrentLanguage(language);
    }
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  const openDocs = async () => {
    closePopover();
    const documentation = await getDocumentation();
    if (!documentation) {
      notifications.toasts.addWarning({
        title: i18n.translate('console.consoleMenu.missingDocumentationPage', {
          defaultMessage: 'Documentation page is not yet available for this API.',
        }),
      });
      return;
    }
    window.open(documentation, '_blank');
  };

  const handleAutoIndent = (event: React.MouseEvent) => {
    closePopover();
    autoIndent(event);
  };

  const button = (
    <EuiButtonIcon
      onClick={() => {
        setIsPopoverOpen((prev) => !prev);
        checkIsKbnRequestSelected();
      }}
      data-test-subj="toggleConsoleMenu"
      aria-label={i18n.translate('console.requestOptionsButtonAriaLabel', {
        defaultMessage: 'Request options',
      })}
      iconType="boxesVertical"
      iconSize="s"
    />
  );

  const items = [
    <EuiContextMenuItem
      key="Copy as"
      data-test-subj="consoleMenuCopyAsButton"
      id="copyAs"
      disabled={!window.navigator?.clipboard}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        const target = e.target as HTMLButtonElement;

        if (target.dataset.name === 'changeLanguage') {
          setLanguageSelectorVisibility(true);
          return;
        }

        onCopyAsSubmit();
      }}
      icon="copyClipboard"
      css={styles.button}
    >
      <EuiFlexGroup alignItems="center">
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="xs" alignItems="center" className="languageSelector">
            <EuiFlexItem grow={false}>
              <FormattedMessage
                tagName="span"
                id="console.monaco.requestOptions.copyAsUrlButtonLabel"
                defaultMessage="Copy as"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <strong>{getLanguageLabelByValue(currentLanguage)}</strong>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        {!isKbnRequestSelected && (
          <EuiFlexItem grow={false}>
            {isRequestConverterLoading ? (
              <EuiLoadingSpinner size="s" />
            ) : (
              // The EuiContextMenuItem renders itself as a button already, so we need to
              // force the link to not be a button in order to prevent A11Y issues.
              <EuiLink href="" data-name="changeLanguage" data-test-subj="changeLanguageButton">
                {i18n.translate('console.consoleMenu.changeLanguageButtonLabel', {
                  defaultMessage: 'Change',
                })}
              </EuiLink>
            )}
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiContextMenuItem>,
    <EuiContextMenuItem
      data-test-subj="consoleMenuAutoIndent"
      key="Auto indent"
      onClick={handleAutoIndent}
      icon="kqlFunction"
    >
      <FormattedMessage
        id="console.monaco.requestOptions.autoIndentButtonLabel"
        defaultMessage="Auto indent"
      />
    </EuiContextMenuItem>,
    <EuiContextMenuItem
      key="Open documentation"
      data-test-subj="consoleMenuOpenDocs"
      onClick={openDocs}
      icon="documentation"
    >
      <FormattedMessage
        id="console.monaco.requestOptions.openDocumentationButtonLabel"
        defaultMessage="Open API reference"
      />
    </EuiContextMenuItem>,
  ];

  return (
    <>
      <EuiPopover
        id="contextMenu"
        button={button}
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        panelPaddingSize="none"
        anchorPosition="downLeft"
      >
        <EuiContextMenuPanel items={items} data-test-subj="consoleMenu" />
      </EuiPopover>
      {isLanguageSelectorVisible && (
        <LanguageSelectorModal
          currentLanguage={currentLanguage}
          changeDefaultLanguage={changeDefaultLanguage}
          closeModal={() => setLanguageSelectorVisibility(false)}
          onSubmit={onCopyAsSubmit}
        />
      )}
    </>
  );
};
