/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AnnotationDomainType, LineAnnotation } from '@elastic/charts';
import { EuiThemeComputed, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { euiStyled } from '@kbn/kibana-react-plugin/common';
import React, { useMemo } from 'react';
import { formatMillisecond } from '../../../common/network_data/data_formatting';
import { MarkerItems, useWaterfallContext } from '../context/waterfall_context';
import { WaterfallMarkerIcon } from './waterfall_marker_icon';

export const FIELD_SYNTHETICS_LCP = 'browser.experience.lcp.us';
export const FIELD_SYNTHETICS_FCP = 'browser.experience.fcp.us';
export const FIELD_SYNTHETICS_DOCUMENT_ONLOAD = 'browser.experience.load.us';
export const FIELD_SYNTHETICS_DCL = 'browser.experience.dcl.us';
export const LAYOUT_SHIFT = 'layoutShift';

export function WaterfallChartMarkers() {
  const { euiTheme } = useEuiTheme();
  const { markerItems, showCustomMarks } = useWaterfallContext();

  const markerItemsByOffset = useMemo(
    () =>
      (markerItems ?? []).reduce((acc, cur) => {
        acc.set(cur.offset, [...(acc.get(cur.offset) ?? []), cur]);
        return acc;
      }, new Map<number, MarkerItems>()),
    [markerItems]
  );

  const annotations = useMemo(() => {
    let lastOffset: number;
    const recognizedMarkerItemsByOffset = Array.from(markerItemsByOffset.entries()).reduce(
      (acc, [offset, items]) => {
        // Remove unrecognized marks e.g. custom marks if `showCustomMarks` is false
        const vitalMarkers = showCustomMarks
          ? items
          : items.filter(({ id }) => getMarkersInfo(id, euiTheme) !== undefined);

        const hasMultipleMarksAtOffset = vitalMarkers.some(({ id }) => id !== LAYOUT_SHIFT);
        const isLastOffsetTooClose = lastOffset && Math.abs(offset - lastOffset) < 100; // 100ms

        // If offsets coincide or are too close, remove less important marks e.g. Layout Shift
        const filteredItems =
          hasMultipleMarksAtOffset || isLastOffsetTooClose
            ? vitalMarkers.filter(({ id }) => id !== LAYOUT_SHIFT)
            : vitalMarkers;

        if (filteredItems.length) {
          acc.set(offset, filteredItems);
        }

        lastOffset = offset;
        return acc;
      },
      new Map<number, MarkerItems>()
    );

    return Array.from(recognizedMarkerItemsByOffset.entries()).map(([offset, items]) => {
      const uniqueIds = (items ?? [])
        .map(({ id }) => id)
        .filter((id, index, arr) => arr.indexOf(id) === index);

      const label = uniqueIds.map((id) => getMarkersInfo(id, euiTheme)?.label ?? id).join(' / ');
      const id = uniqueIds[0];
      const markersInfo = getMarkersInfo(id, euiTheme);

      return {
        id,
        offset,
        label,
        field: markersInfo?.field ?? '',
        color: markersInfo?.color ?? euiTheme.colors.mediumShade,
        strokeWidth: markersInfo?.strokeWidth ?? 1,
        dash: markersInfo?.dash,
      };
    });
  }, [markerItemsByOffset, showCustomMarks, euiTheme]);

  if (!markerItems) {
    return null;
  }

  return (
    <Wrapper>
      {annotations.map(({ id, offset, label, field, color, strokeWidth, dash }) => {
        const key = `${id}-${offset}`;

        return (
          <LineAnnotation
            key={key}
            id={key}
            domainType={AnnotationDomainType.YDomain}
            dataValues={[
              {
                dataValue: offset,
                details: label,
                header: formatMillisecond(offset, { maxMillis: 4000 }),
              },
            ]}
            marker={<WaterfallMarkerIcon field={field} label={label} />}
            style={{
              line: {
                strokeWidth,
                stroke: color,
                opacity: 1,
                dash,
              },
            }}
            zIndex={Number(euiTheme.levels.content)}
          />
        );
      })}
    </Wrapper>
  );
}

function getMarkersInfo(id: string, euiTheme: EuiThemeComputed) {
  switch (id) {
    case 'domContentLoaded':
      return {
        label: DOCUMENT_CONTENT_LOADED_LABEL,
        color: euiTheme.colors.mediumShade,
        field: FIELD_SYNTHETICS_DCL,
        strokeWidth: 1,
        dash: undefined,
      };
    case 'firstContentfulPaint':
      return {
        label: FCP_LABEL,
        color: euiTheme.colors.mediumShade,
        field: FIELD_SYNTHETICS_FCP,
        strokeWidth: 1,
        dash: undefined,
      };
    case 'largestContentfulPaint':
      return {
        label: LCP_LABEL,
        color: euiTheme.colors.mediumShade,
        field: FIELD_SYNTHETICS_LCP,
        strokeWidth: 1,
        dash: undefined,
      };
    case 'layoutShift':
      return {
        label: LAYOUT_SHIFT_LABEL,
        color: euiTheme.colors.mediumShade,
        field: '',
        strokeWidth: 1,
        dash: [5, 5],
      };
    case 'loadEvent':
      return {
        label: LOAD_EVENT_LABEL,
        color: euiTheme.colors.mediumShade,
        field: FIELD_SYNTHETICS_DOCUMENT_ONLOAD,
        strokeWidth: 1,
        dash: undefined,
      };
  }

  return undefined;
}

const Wrapper = euiStyled.span`
  &&& {
    > .echAnnotation__icon {
      top: 8px;
    }
  }
`;

export const FCP_LABEL = i18n.translate('xpack.synthetics.synthetics.waterfall.fcpLabel', {
  defaultMessage: 'First contentful paint',
});

export const LCP_LABEL = i18n.translate('xpack.synthetics.synthetics.waterfall.lcpLabel', {
  defaultMessage: 'Largest contentful paint',
});

export const LAYOUT_SHIFT_LABEL = i18n.translate(
  'xpack.synthetics.synthetics.waterfall.layoutShiftLabel',
  {
    defaultMessage: 'Layout shift',
  }
);

export const LOAD_EVENT_LABEL = i18n.translate(
  'xpack.synthetics.synthetics.waterfall.loadEventLabel',
  {
    defaultMessage: 'Load event',
  }
);

export const DOCUMENT_CONTENT_LOADED_LABEL = i18n.translate(
  'xpack.synthetics.synthetics.waterfall.domContentLabel',
  {
    defaultMessage: 'DOM Content Loaded',
  }
);
