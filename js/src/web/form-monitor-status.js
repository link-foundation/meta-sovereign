import React from 'react';
import { useT } from './i18n.js';

export const FormMonitorStatus = ({ monitoring }) => {
  const t = useT();
  return monitoring
    ? React.createElement(
        'p',
        {
          role: 'status',
          'data-form-monitor': monitoring.state,
        },
        t(`forms.monitor.${monitoring.state}`, monitoring)
      )
    : null;
};
