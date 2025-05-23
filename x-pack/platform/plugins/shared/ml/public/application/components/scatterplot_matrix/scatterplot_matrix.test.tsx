/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';

import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';

import { createFilterManagerMock } from '@kbn/data-plugin/public/query/filter_manager/filter_manager.mock';

import { ScatterplotMatrix } from './scatterplot_matrix';

const mockFilterManager = createFilterManagerMock();

const mockEsSearch = jest.fn((body) => ({
  hits: { hits: [{ fields: { x: [1], y: [2] } }, { fields: { x: [2], y: [3] } }] },
}));

jest.mock('../../contexts/kibana', () => ({
  useMlApi: () => ({
    esSearch: mockEsSearch,
  }),
  useMlKibana: () => ({
    services: {
      application: {
        navigateToApp: jest.fn(),
      },
      data: {
        query: {
          filterManager: mockFilterManager,
          timefilter: {
            timefilter: {
              getTime: jest.fn(() => {
                return { from: '', to: '' };
              }),
              getRefreshInterval: jest.fn(),
            },
          },
        },
      },
    },
  }),
}));

// Mocking VegaChart to avoid a jest/canvas related error
jest.mock('../vega_chart', () => ({
  VegaChart: () => <div data-test-subj="mlVegaChart" />,
}));

describe('Data Frame Analytics: <ScatterplotMatrix />', () => {
  it('renders the scatterplot matrix wrapper with options but not the chart itself', async () => {
    // prepare
    render(
      <IntlProvider locale="en">
        <ScatterplotMatrix
          {...{
            fields: [],
            index: 'the-index-name',
          }}
        />
      </IntlProvider>
    );

    // assert
    await waitFor(() => {
      expect(mockEsSearch).toHaveBeenCalledTimes(0);
      // should hide the loading indicator and render the wrapping options boilerplate
      expect(screen.queryByTestId('mlScatterplotMatrix loaded')).toBeInTheDocument();
      // should not render the scatterplot matrix itself because there's no data items.
      expect(screen.queryByTestId('mlVegaChart')).not.toBeInTheDocument();
    });
  });

  it('renders the scatterplot matrix wrapper with options and the chart itself', async () => {
    // prepare
    render(
      <IntlProvider locale="en">
        <ScatterplotMatrix
          {...{
            fields: ['x', 'y'],
            index: 'the-index-name',
          }}
        />
      </IntlProvider>
    );

    // assert
    await waitFor(() => {
      expect(mockEsSearch).toHaveBeenCalledWith({
        body: { _source: false, fields: ['x', 'y'], from: 0, query: undefined, size: 1000 },
        index: 'the-index-name',
      });
      // should hide the loading indicator and render the wrapping options boilerplate
      expect(screen.queryByTestId('mlScatterplotMatrix loaded')).toBeInTheDocument();
      // should render the scatterplot matrix.
      expect(screen.queryByTestId('mlVegaChart')).toBeInTheDocument();
    });
  });
});
