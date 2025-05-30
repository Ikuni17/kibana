/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { lazy } from 'react';
import { suspendedComponentWithProps } from '../lib/suspended_component_with_props';
import type { CreateConnectorFlyoutProps } from './action_connector_form/create_connector_flyout';
import type { EditConnectorFlyoutProps } from './action_connector_form/edit_connector_flyout';

export const ConnectorAddFlyout = suspendedComponentWithProps<CreateConnectorFlyoutProps>(
  lazy(() => import('./action_connector_form/create_connector_flyout'))
);
export const ConnectorEditFlyout = suspendedComponentWithProps<EditConnectorFlyoutProps>(
  lazy(() => import('./action_connector_form/edit_connector_flyout'))
);
export const ActionForm = suspendedComponentWithProps(
  lazy(() => import('./action_connector_form/action_form'))
);

export const RuleStatusDropdown = suspendedComponentWithProps(
  lazy(() => import('./rules_list/components/rule_status_dropdown'))
);
export const RuleTagFilter = suspendedComponentWithProps(
  lazy(() => import('./rules_list/components/rule_tag_filter'))
);
export const RuleStatusFilter = suspendedComponentWithProps(
  lazy(() => import('./rules_list/components/rule_status_filter'))
);
export const RuleEventLogList = suspendedComponentWithProps(
  lazy(() => import('./rule_details/components/rule_event_log_list'))
);
export const RulesList = suspendedComponentWithProps(
  lazy(() => import('./rules_list/components/rules_list'))
);
export const RulesListNotifyBadgeWithApi = suspendedComponentWithProps(
  lazy(() => import('./rules_list/components/notify_badge'))
);
export const RuleSnoozeModal = suspendedComponentWithProps(
  lazy(() => import('./rules_list/components/rule_snooze_modal'))
);
export const RuleDefinition = suspendedComponentWithProps(
  lazy(() => import('./rule_details/components/rule_definition'))
);
export const RuleTagBadge = suspendedComponentWithProps(
  lazy(() => import('./rules_list/components/rule_tag_badge'))
);
export const RuleStatusPanel = suspendedComponentWithProps(
  lazy(() => import('./rule_details/components/rule_status_panel'))
);

export const UntrackAlertsModal = suspendedComponentWithProps(
  lazy(() =>
    import('./common/components/untrack_alerts_modal').then((module) => ({
      default: module.UntrackAlertsModal,
    }))
  )
);

export const GlobalRuleEventLogList = suspendedComponentWithProps(
  lazy(() => import('./rule_details/components/global_rule_event_log_list'))
);
