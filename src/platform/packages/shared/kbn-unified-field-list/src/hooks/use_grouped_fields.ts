/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { groupBy } from 'lodash';
import { useEffect, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { type CoreStart } from '@kbn/core-lifecycle-browser';
import type { DataView, DataViewField } from '@kbn/data-views-plugin/common';
import { type DataViewsContract } from '@kbn/data-views-plugin/public';
import { type UseNewFieldsParams, useNewFields } from './use_new_fields';
import {
  type FieldListGroups,
  type FieldsGroup,
  type FieldListItem,
  type OverrideFieldGroupDetails,
  FieldsGroupNames,
  ExistenceFetchStatus,
} from '../types';
import { useExistingFieldsReader } from './use_existing_fields';
import {
  useFieldFilters,
  type FieldFiltersResult,
  type FieldFiltersParams,
} from './use_field_filters';

export interface GroupedFieldsParams<T extends FieldListItem> {
  dataViewId: string | null; // `null` is for text-based queries
  allFields: T[] | null; // `null` is for loading indicator
  services: {
    dataViews: DataViewsContract;
    core: Pick<CoreStart, 'docLinks'>;
  };
  isAffectedByGlobalFilter?: boolean;
  popularFieldsLimit?: number;
  sortedSelectedFields?: T[];
  getCustomFieldType?: FieldFiltersParams<T>['getCustomFieldType'];
  onOverrideFieldGroupDetails?: OverrideFieldGroupDetails;
  onSupportedFieldFilter?: (field: T) => boolean;
  onSelectedFieldFilter?: (field: T) => boolean;
  getNewFieldsBySpec?: UseNewFieldsParams<T>['getNewFieldsBySpec'];
}

export interface GroupedFieldsResult<T extends FieldListItem> {
  fieldListFiltersProps: FieldFiltersResult<T>['fieldListFiltersProps'];
  fieldListGroupedProps: {
    fieldGroups: FieldListGroups<T>;
    scrollToTopResetCounter: number;
    fieldsExistenceStatus: ExistenceFetchStatus;
    fieldsExistInIndex: boolean;
    screenReaderDescriptionId?: string;
  };
  allFieldsModified: T[] | null; // `null` is for loading indicator
  hasNewFields: boolean;
}

export function useGroupedFields<T extends FieldListItem = DataViewField>({
  dataViewId,
  allFields,
  services,
  isAffectedByGlobalFilter = false,
  popularFieldsLimit,
  sortedSelectedFields,
  getCustomFieldType,
  onOverrideFieldGroupDetails,
  onSupportedFieldFilter,
  onSelectedFieldFilter,
  getNewFieldsBySpec,
}: GroupedFieldsParams<T>): GroupedFieldsResult<T> {
  const fieldsExistenceReader = useExistingFieldsReader();
  const fieldListFilters = useFieldFilters<T>({
    allFields,
    services,
    getCustomFieldType,
    onSupportedFieldFilter,
  });

  const onFilterFieldList = fieldListFilters.onFilterField;
  const [dataView, setDataView] = useState<DataView | null>(null);
  const isAffectedByTimeFilter = Boolean(dataView?.timeFieldName);
  const fieldsExistenceInfoUnavailable: boolean = dataViewId
    ? fieldsExistenceReader.isFieldsExistenceInfoUnavailable(dataViewId)
    : true;
  const hasFieldDataHandler = dataViewId
    ? fieldsExistenceReader.hasFieldData
    : hasFieldDataByDefault;

  useEffect(() => {
    const getDataView = async () => {
      if (dataViewId) {
        let nextDataView: DataView | null = null;
        try {
          nextDataView = await services.dataViews.get(dataViewId, false);
        } catch (e) {
          //
        }
        setDataView(nextDataView || null);
      } else {
        setDataView(null);
      }
    };
    getDataView();
    // if field existence information changed, reload the data view too
  }, [dataViewId, services.dataViews, setDataView, hasFieldDataHandler]);

  const { allFieldsModified, hasNewFields } = useNewFields<T>({
    dataView,
    allFields,
    getNewFieldsBySpec,
    fieldsExistenceReader,
  });

  // important when switching from a known dataViewId to no data view (like in text-based queries)
  useEffect(() => {
    if (dataView && !dataViewId) {
      setDataView(null);
    }
  }, [dataView, setDataView, dataViewId]);

  const scrollToTopResetCounter: number = useMemo(
    () => Date.now(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataViewId, onFilterFieldList]
  );

  const unfilteredFieldGroups: FieldListGroups<T> = useMemo(() => {
    const containsData = (field: T) => {
      return dataViewId ? hasFieldDataHandler(dataViewId, field.name) : true;
    };

    const selectedFields = sortedSelectedFields || [];

    const sortedFields = [...(allFieldsModified || [])].sort(sortFields);

    const groupedFields = {
      ...getDefaultFieldGroups(),
      ...groupBy(sortedFields, (field) => {
        if (!sortedSelectedFields && onSelectedFieldFilter && onSelectedFieldFilter(field)) {
          selectedFields.push(field);
        }

        if (onSupportedFieldFilter && !onSupportedFieldFilter(field)) {
          return 'skippedFields';
        }
        if (field.type === 'document') {
          return 'specialFields';
        }
        if (dataView?.metaFields?.includes(field.name)) {
          return 'metaFields';
        }
        // `nested` root fields are not a part of data view fields list, so we need to check them separately
        if (field.type === 'nested') {
          return 'availableFields';
        }

        if (field?.isNull) {
          return 'emptyFields';
        }
        if (dataView?.getFieldByName && !dataView.getFieldByName(field.name)) {
          return 'unmappedFields';
        }
        if (containsData(field) || fieldsExistenceInfoUnavailable) {
          return 'availableFields';
        }
        return 'emptyFields';
      }),
    };

    const popularFields = popularFieldsLimit
      ? sortedFields
          .filter(
            (field) =>
              field.count &&
              field.type !== '_source' &&
              (!onSupportedFieldFilter || onSupportedFieldFilter(field))
          )
          .sort((a: T, b: T) => (b.count || 0) - (a.count || 0)) // sort by popularity score
          .slice(0, popularFieldsLimit)
      : [];

    let fieldGroupDefinitions: FieldListGroups<T> = {
      SpecialFields: {
        fields: groupedFields.specialFields,
        fieldCount: groupedFields.specialFields.length,
        isAffectedByGlobalFilter: false,
        isAffectedByTimeFilter: false,
        isInitiallyOpen: false,
        showInAccordion: false,
        title: '',
        hideDetails: true,
      },
      SelectedFields: {
        fields: selectedFields,
        fieldCount: selectedFields.length,
        isInitiallyOpen: true,
        showInAccordion: true,
        title: i18n.translate('unifiedFieldList.useGroupedFields.selectedFieldsLabel', {
          defaultMessage: 'Selected fields',
        }),
        isAffectedByGlobalFilter,
        isAffectedByTimeFilter,
        hideDetails: false,
        hideIfEmpty: true,
      },
      PopularFields: {
        fields: popularFields,
        fieldCount: popularFields.length,
        isInitiallyOpen: true,
        showInAccordion: true,
        title: i18n.translate('unifiedFieldList.useGroupedFields.popularFieldsLabel', {
          defaultMessage: 'Popular fields',
        }),
        helpText: i18n.translate('unifiedFieldList.useGroupedFields.popularFieldsLabelHelp', {
          defaultMessage:
            'Fields that your organization frequently uses, from most to least popular.',
        }),
        isAffectedByGlobalFilter,
        isAffectedByTimeFilter,
        hideDetails: false,
        hideIfEmpty: true,
      },
      AvailableFields: {
        fields: groupedFields.availableFields,
        fieldCount: groupedFields.availableFields.length,
        isInitiallyOpen: true,
        showInAccordion: true,
        title:
          dataViewId && fieldsExistenceInfoUnavailable
            ? i18n.translate('unifiedFieldList.useGroupedFields.allFieldsLabel', {
                defaultMessage: 'All fields',
              })
            : i18n.translate('unifiedFieldList.useGroupedFields.availableFieldsLabel', {
                defaultMessage: 'Available fields',
              }),
        isAffectedByGlobalFilter,
        isAffectedByTimeFilter,
        // Show details on timeout but not failure
        // hideDetails: fieldsExistenceInfoUnavailable && !existenceFetchTimeout, // TODO: is this check still necessary?
        hideDetails: fieldsExistenceInfoUnavailable,
        defaultNoFieldsMessage: i18n.translate(
          'unifiedFieldList.useGroupedFields.noAvailableDataLabel',
          {
            defaultMessage: `No available fields containing data.`,
          }
        ),
      },
      UnmappedFields: {
        fields: groupedFields.unmappedFields,
        fieldCount: groupedFields.unmappedFields.length,
        isAffectedByGlobalFilter,
        isAffectedByTimeFilter,
        isInitiallyOpen: false,
        showInAccordion: true,
        hideDetails: false,
        hideIfEmpty: true,
        title: i18n.translate('unifiedFieldList.useGroupedFields.unmappedFieldsLabel', {
          defaultMessage: 'Unmapped fields',
        }),
        helpText: i18n.translate('unifiedFieldList.useGroupedFields.unmappedFieldsLabelHelp', {
          defaultMessage: "Fields that aren't explicitly mapped to a field data type.",
        }),
      },
      EmptyFields: {
        fields: groupedFields.emptyFields,
        fieldCount: groupedFields.emptyFields.length,
        isAffectedByGlobalFilter: false,
        isAffectedByTimeFilter: false,
        isInitiallyOpen: false,
        showInAccordion: true,
        hideDetails: false,
        hideIfEmpty: true,
        title: i18n.translate('unifiedFieldList.useGroupedFields.emptyFieldsLabel', {
          defaultMessage: 'Empty fields',
        }),
        helpText: i18n.translate('unifiedFieldList.useGroupedFields.emptyFieldsLabelHelp', {
          defaultMessage: "Fields that don't have any values based on your filters.",
        }),
        defaultNoFieldsMessage: i18n.translate(
          'unifiedFieldList.useGroupedFields.noEmptyDataLabel',
          {
            defaultMessage: `There are no empty fields.`,
          }
        ),
      },
      MetaFields: {
        fields: groupedFields.metaFields,
        fieldCount: groupedFields.metaFields.length,
        isAffectedByGlobalFilter: false,
        isAffectedByTimeFilter: false,
        isInitiallyOpen: false,
        showInAccordion: true,
        hideDetails: false,
        hideIfEmpty: !dataViewId,
        title: i18n.translate('unifiedFieldList.useGroupedFields.metaFieldsLabel', {
          defaultMessage: 'Meta fields',
        }),
        defaultNoFieldsMessage: i18n.translate(
          'unifiedFieldList.useGroupedFields.noMetaDataLabel',
          {
            defaultMessage: `There are no meta fields.`,
          }
        ),
      },
    };

    // the fieldsExistenceInfoUnavailable check should happen only for dataview based
    const dataViewFieldsExistenceUnavailable = dataViewId && fieldsExistenceInfoUnavailable;
    // for textbased queries, rely on the empty fields length
    const textBasedFieldsExistenceUnavailable = !dataViewId && !groupedFields.emptyFields.length;

    if (dataViewFieldsExistenceUnavailable || textBasedFieldsExistenceUnavailable) {
      delete fieldGroupDefinitions.EmptyFields;
    }

    if (onOverrideFieldGroupDetails) {
      fieldGroupDefinitions = Object.keys(fieldGroupDefinitions).reduce<FieldListGroups<T>>(
        (definitions, name) => {
          const groupName = name as FieldsGroupNames;
          const group: FieldsGroup<T> | undefined = fieldGroupDefinitions[groupName];
          if (group) {
            definitions[groupName] = {
              ...group,
              ...(onOverrideFieldGroupDetails(groupName) || {}),
            };
          }
          return definitions;
        },
        {} as FieldListGroups<T>
      );
    }

    return fieldGroupDefinitions;
  }, [
    allFieldsModified,
    onSupportedFieldFilter,
    onSelectedFieldFilter,
    onOverrideFieldGroupDetails,
    dataView,
    dataViewId,
    hasFieldDataHandler,
    fieldsExistenceInfoUnavailable,
    isAffectedByGlobalFilter,
    isAffectedByTimeFilter,
    popularFieldsLimit,
    sortedSelectedFields,
  ]);

  const fieldGroups: FieldListGroups<T> = useMemo(() => {
    if (!onFilterFieldList) {
      return unfilteredFieldGroups;
    }

    return Object.fromEntries(
      Object.entries(unfilteredFieldGroups).map(([name, group]) => [
        name,
        {
          ...group,
          fieldSearchHighlight: fieldListFilters.fieldSearchHighlight,
          fields: group.fields.filter(onFilterFieldList),
        },
      ])
    ) as FieldListGroups<T>;
  }, [unfilteredFieldGroups, onFilterFieldList, fieldListFilters.fieldSearchHighlight]);

  const hasDataLoaded = Boolean(allFields);
  const allFieldsLength = allFields?.length;

  const fieldsExistInIndex = useMemo(() => {
    return dataViewId ? Boolean(allFieldsLength) : true;
  }, [dataViewId, allFieldsLength]);

  const fieldsExistenceStatus = useMemo(() => {
    if (!hasDataLoaded) {
      return ExistenceFetchStatus.unknown; // to show loading indicator in the list
    }
    if (!dataViewId || !fieldsExistenceReader) {
      // ex. for text-based queries
      return ExistenceFetchStatus.succeeded;
    }
    return fieldsExistenceReader.getFieldsExistenceStatus(dataViewId);
  }, [dataViewId, hasDataLoaded, fieldsExistenceReader]);

  const screenReaderDescriptionId =
    fieldListFilters.fieldListFiltersProps.screenReaderDescriptionId;
  const fieldListGroupedProps = useMemo(() => {
    return {
      fieldGroups,
      scrollToTopResetCounter,
      fieldsExistInIndex,
      fieldsExistenceStatus,
      screenReaderDescriptionId,
    };
  }, [
    fieldGroups,
    scrollToTopResetCounter,
    fieldsExistInIndex,
    fieldsExistenceStatus,
    screenReaderDescriptionId,
  ]);

  return {
    fieldListGroupedProps,
    fieldListFiltersProps: fieldListFilters.fieldListFiltersProps,
    allFieldsModified,
    hasNewFields,
  };
}

const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
});

function sortFields<T extends FieldListItem>(fieldA: T, fieldB: T) {
  return collator.compare(fieldA.displayName || fieldA.name, fieldB.displayName || fieldB.name);
}

function hasFieldDataByDefault(): boolean {
  return true;
}

function getDefaultFieldGroups() {
  return {
    specialFields: [],
    availableFields: [],
    emptyFields: [],
    metaFields: [],
    unmappedFields: [],
    skippedFields: [],
  };
}
