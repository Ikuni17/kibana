/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { cloneDeep } from 'lodash';
import type { IUiSettingsClient } from '@kbn/core/public';
import type { SavedSearch } from '@kbn/saved-search-plugin/public';
import { getChartHidden } from '@kbn/unified-histogram';
import {
  DEFAULT_COLUMNS_SETTING,
  DOC_HIDE_TIME_COLUMN_SETTING,
  SORT_DEFAULT_ORDER_SETTING,
  getDefaultSort,
  getSortArray,
} from '@kbn/discover-utils';
import { isOfAggregateQueryType } from '@kbn/es-query';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { DiscoverAppState } from '../discover_app_state_container';
import type { DiscoverServices } from '../../../../build_services';
import { getValidViewMode } from '../../utils/get_valid_view_mode';
import { createDataViewDataSource, createEsqlDataSource } from '../../../../../common/data_sources';

function getDefaultColumns(savedSearch: SavedSearch | undefined, uiSettings: IUiSettingsClient) {
  if (savedSearch?.columns && savedSearch.columns.length > 0) {
    return [...savedSearch.columns];
  }
  return [...uiSettings.get(DEFAULT_COLUMNS_SETTING)];
}

export function getStateDefaults({
  savedSearch,
  overrideDataView,
  services,
}: {
  savedSearch: SavedSearch | undefined;
  overrideDataView?: DataView;
  services: DiscoverServices;
}) {
  const searchSource = savedSearch?.searchSource;
  const { data, uiSettings, storage } = services;
  const dataView = overrideDataView ?? searchSource?.getField('index');
  const query = searchSource?.getField('query') || data.query.queryString.getDefaultQuery();
  const isEsqlQuery = isOfAggregateQueryType(query);
  const sort = getSortArray(savedSearch?.sort ?? [], dataView!, isEsqlQuery);
  const columns = getDefaultColumns(savedSearch, uiSettings);
  const chartHidden = getChartHidden(storage, 'discover');
  const dataSource = isEsqlQuery
    ? createEsqlDataSource()
    : dataView?.id
    ? createDataViewDataSource({ dataViewId: dataView.id })
    : undefined;

  const defaultState: DiscoverAppState = {
    query,
    sort: !sort.length
      ? getDefaultSort(
          dataView,
          uiSettings.get(SORT_DEFAULT_ORDER_SETTING, 'desc'),
          uiSettings.get(DOC_HIDE_TIME_COLUMN_SETTING, false),
          isEsqlQuery
        )
      : sort,
    columns,
    dataSource,
    interval: 'auto',
    filters: cloneDeep(searchSource?.getOwnField('filter')) as DiscoverAppState['filters'],
    hideChart: chartHidden,
    viewMode: undefined,
    hideAggregatedPreview: undefined,
    savedQuery: undefined,
    rowHeight: undefined,
    headerRowHeight: undefined,
    rowsPerPage: undefined,
    sampleSize: undefined,
    grid: undefined,
    breakdownField: undefined,
    density: undefined,
  };

  if (savedSearch?.grid) {
    defaultState.grid = savedSearch.grid;
  }
  if (savedSearch?.hideChart !== undefined) {
    defaultState.hideChart = savedSearch.hideChart;
  }
  if (savedSearch?.rowHeight !== undefined) {
    defaultState.rowHeight = savedSearch.rowHeight;
  }
  if (savedSearch?.headerRowHeight !== undefined) {
    defaultState.headerRowHeight = savedSearch.headerRowHeight;
  }
  if (savedSearch?.viewMode) {
    defaultState.viewMode = getValidViewMode({
      viewMode: savedSearch.viewMode,
      isEsqlMode: isEsqlQuery,
    });
  }
  if (savedSearch?.hideAggregatedPreview) {
    defaultState.hideAggregatedPreview = savedSearch.hideAggregatedPreview;
  }
  if (savedSearch?.rowsPerPage) {
    defaultState.rowsPerPage = savedSearch.rowsPerPage;
  }
  if (savedSearch?.sampleSize) {
    defaultState.sampleSize = savedSearch.sampleSize;
  }
  if (savedSearch?.breakdownField) {
    defaultState.breakdownField = savedSearch.breakdownField;
  }
  if (savedSearch?.density) {
    defaultState.density = savedSearch.density;
  }

  return defaultState;
}
