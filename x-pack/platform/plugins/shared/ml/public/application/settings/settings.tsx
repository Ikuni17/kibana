/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { Fragment } from 'react';
import { EuiSpacer } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { AnomalyDetectionSettings } from './anomaly_detection_settings';
import { HelpMenu } from '../components/help_menu';
import { useMlKibana } from '../contexts/kibana';
import { MlPageHeader } from '../components/page_header';

export const Settings: FC = () => {
  const {
    services: { docLinks },
  } = useMlKibana();
  const helpLink = docLinks.links.ml.guide;
  return (
    <Fragment>
      <EuiSpacer size="m" />
      <div data-test-subj="mlPageSettings">
        <MlPageHeader>
          <FormattedMessage
            id="xpack.ml.anomalyDetectionSettings.title"
            defaultMessage="Anomaly Detection Settings"
          />
        </MlPageHeader>
        <AnomalyDetectionSettings />
      </div>
      <HelpMenu docLink={helpLink} />
    </Fragment>
  );
};
