/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo, useCallback } from 'react';
import { useAssistantOverlay } from '@kbn/elastic-assistant';
import {
  getAttackDiscoveryMarkdown,
  type AttackDiscovery,
  type Replacements,
} from '@kbn/elastic-assistant-common';
import { useAssistantAvailability } from '../../../../../assistant/use_assistant_availability';

/**
 * This category is provided in the prompt context for the assistant
 */
const category = 'insight';
export const useViewInAiAssistant = ({
  attackDiscovery,
  replacements,
}: {
  attackDiscovery: AttackDiscovery | undefined;
  replacements?: Replacements;
}) => {
  const { hasAssistantPrivilege, isAssistantEnabled } = useAssistantAvailability();

  // the prompt context for this insight:
  const getPromptContext = useCallback(
    async () =>
      attackDiscovery != null
        ? getAttackDiscoveryMarkdown({
            attackDiscovery,
            // note: we do NOT want to replace the replacements here
          })
        : '',
    [attackDiscovery]
  );

  const lastFive = attackDiscovery?.id ? ` - ${attackDiscovery.id.slice(-5)}` : '';
  const { promptContextId, showAssistantOverlay: showOverlay } = useAssistantOverlay(
    category,
    attackDiscovery?.title + lastFive, // conversation title
    attackDiscovery?.title ?? '', // description used in context pill
    getPromptContext,
    attackDiscovery?.id ?? null, // accept the UUID default for this prompt context
    null, // suggestedUserPrompt
    null, // tooltip
    isAssistantEnabled,
    replacements ?? null
  );

  // proxy show / hide calls to assistant context, using our internal prompt context id:
  const showAssistantOverlay = useCallback(() => {
    showOverlay(true);
  }, [showOverlay]);

  const disabled = attackDiscovery == null || !hasAssistantPrivilege || promptContextId == null;

  return useMemo(
    () => ({ promptContextId, disabled, showAssistantOverlay }),
    [promptContextId, disabled, showAssistantOverlay]
  );
};
