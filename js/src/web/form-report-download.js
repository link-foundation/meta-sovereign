import React from 'react';
import { useT } from './i18n.js';
import { formReportMarkdown } from '../forms/report-markdown.js';

export const downloadFormReport = (report, format = 'json') => {
  const markdown = format === 'markdown';
  const href = URL.createObjectURL(
    new globalThis.Blob(
      [markdown ? formReportMarkdown(report) : JSON.stringify(report, null, 2)],
      { type: markdown ? 'text/markdown;charset=utf-8' : 'application/json' }
    )
  );
  const anchor = globalThis.document.createElement('a');
  anchor.href = href;
  const name = report.mode === 'read-only' ? 'inspection' : report.mode;
  anchor.download = `form-${name}-${report.capturedAt.replace(/[:.]/gu, '-')}.${markdown ? 'md' : 'json'}`;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(href), 1000);
};

export const FormReportDownloads = ({ report }) => {
  const t = useT();
  return React.createElement(
    'div',
    { className: 'row wrap' },
    ['json', 'markdown'].map((format) =>
      React.createElement(
        'button',
        {
          key: format,
          type: 'button',
          'data-action':
            format === 'json'
              ? 'download-form-report'
              : 'download-form-markdown',
          onClick: () => downloadFormReport(report, format),
        },
        t(format === 'json' ? 'forms.download' : 'forms.downloadMarkdown')
      )
    )
  );
};

export const FormReportFile = ({ file }) => {
  const t = useT();
  return file
    ? React.createElement(
        'p',
        {
          role: file.state === 'saved' ? 'status' : 'alert',
          'data-form-report-file': file.state,
          className: 'meta',
          style: { overflowWrap: 'anywhere' },
        },
        t(file.state === 'saved' ? 'forms.reportSaved' : 'forms.reportFailed', {
          path: file.path,
        })
      )
    : null;
};
