/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AggregationsCustomCategorizeTextAnalyzer } from '@elastic/elasticsearch/lib/api/types';

// This is a copy of the default categorization analyzer but using the 'standard' tokenizer rather than the 'ml_standard' tokenizer.
// The 'ml_standard' tokenizer splits tokens in a way that was observed to give better categories in testing many years ago, however,
// the downside of these better categories is then a potential failure to match the original documents when creating a filter for Discover.
// A future enhancement would be to check which analyzer is specified in the mappings for the source field and to use
// that instead of unconditionally using 'standard'.
// However for an initial fix, using the standard analyzer will be more likely to match the results from the majority of searches.
export const categorizationAnalyzer: AggregationsCustomCategorizeTextAnalyzer = {
  char_filter: ['first_line_with_letters'],
  tokenizer: 'standard',
  filter: [
    // @ts-expect-error filter type in AggregationsCustomCategorizeTextAnalyzer is incorrect
    {
      type: 'stop',
      stopwords: [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
        'Sun',
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
        'GMT',
        'UTC',
      ],
    },
    // @ts-expect-error filter type in AggregationsCustomCategorizeTextAnalyzer is incorrect
    {
      type: 'limit',
      max_token_count: '100',
    },
  ],
};
