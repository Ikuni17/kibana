/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import React, { useMemo } from 'react';

import { useKibana } from '../../../common/lib/kibana/kibana_react';
import {
  APP_ID,
  ENABLE_NEWS_FEED_SETTING,
  NEWS_FEED_URL_SETTING,
} from '../../../../common/constants';
import { Filters as RecentTimelinesFilters } from '../recent_timelines/filters';
import { StatefulRecentTimelines } from '../recent_timelines';
import { StatefulNewsFeed } from '../../../common/components/news_feed';
import { useUserPrivileges } from '../../../common/components/user_privileges';
import type { FilterMode as RecentTimelinesFilterMode } from '../recent_timelines/types';
import { SidebarHeader } from '../../../common/components/sidebar_header';

import * as i18n from '../../pages/translations';
import { RecentCases } from '../recent_cases';

const SidebarSpacerComponent = () => (
  <EuiFlexItem grow={false}>
    <EuiSpacer size="xxl" />
  </EuiFlexItem>
);

SidebarSpacerComponent.displayName = 'SidebarSpacerComponent';
export const Sidebar = React.memo<{
  recentTimelinesFilterBy: RecentTimelinesFilterMode;
  setRecentTimelinesFilterBy: (filterBy: RecentTimelinesFilterMode) => void;
}>(({ recentTimelinesFilterBy, setRecentTimelinesFilterBy }) => {
  const { cases } = useKibana().services;
  const {
    timelinePrivileges: { read: canSeeTimelines },
  } = useUserPrivileges();
  const recentTimelinesFilters = useMemo(
    () => (
      <RecentTimelinesFilters
        filterBy={recentTimelinesFilterBy}
        setFilterBy={setRecentTimelinesFilterBy}
      />
    ),
    [recentTimelinesFilterBy, setRecentTimelinesFilterBy]
  );

  // only render the recently created cases view if the user has at least read permissions
  const userCasesPermissions = cases.helpers.canUseCases([APP_ID]);
  const hasCasesReadPermissions = userCasesPermissions.read;

  return (
    <EuiFlexGroup direction="column" responsive={false} gutterSize="l">
      {hasCasesReadPermissions && (
        <EuiFlexItem grow={false}>
          <RecentCases />
        </EuiFlexItem>
      )}

      {canSeeTimelines && (
        <EuiFlexItem grow={false} data-test-subj="recent-timelines-container">
          <SidebarHeader title={i18n.RECENT_TIMELINES}>{recentTimelinesFilters}</SidebarHeader>
          <StatefulRecentTimelines filterBy={recentTimelinesFilterBy} />
        </EuiFlexItem>
      )}

      <EuiFlexItem grow={false}>
        <StatefulNewsFeed
          enableNewsFeedSetting={ENABLE_NEWS_FEED_SETTING}
          newsFeedSetting={NEWS_FEED_URL_SETTING}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
});

Sidebar.displayName = 'Sidebar';
