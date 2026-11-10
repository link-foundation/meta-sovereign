import React, { useState } from 'react';
import { useT } from './i18n.js';
import { FormReportDownloads } from './form-report-download.js';
import { FormApplicationResult } from './form-reviewed-plan.js';
import { FormChoiceResult } from './form-choice-disclosure.js';
import { FormResumeUploadResult } from './form-resume-upload.js';
import { FormMonitorStatus } from './form-monitor-status.js';

const el = React.createElement;
const FormJournalOutcome = ({ checkpoint }) => {
  const t = useT();
  const result = checkpoint.report.outcome;
  const Component = {
    apply: FormApplicationResult,
    attach: FormResumeUploadResult,
    disclose: FormChoiceResult,
  }[checkpoint.action];
  return el('div', { className: 'col' }, [
    result && Component ? el(Component, { key: 'outcome', result }) : null,
    checkpoint.report.observation === 'last-reviewed-snapshot'
      ? el('p', { key: 'previous', role: 'note' }, t('forms.journal.previous'))
      : null,
  ]);
};
export const FormReviewJournal = ({ report, Report }) => {
  const t = useT();
  const [selected, setSelected] = useState(null);
  const checkpoint = report.checkpoints.find(
    (entry) => entry.sequence === selected
  );
  return el(
    'section',
    { className: 'col', 'data-form-journal': report.coverage },
    [
      el('h2', { key: 'title' }, t('forms.journal.title')),
      el('p', { key: 'scope', role: 'note' }, t('forms.journal.scope')),
      el(FormMonitorStatus, { key: 'monitor', monitoring: report.monitoring }),
      el(
        'p',
        { key: 'count', role: 'status' },
        t('forms.journal.count', {
          count: report.checkpoints.length,
          omitted: report.omittedCheckpoints,
        })
      ),
      el(FormReportDownloads, { key: 'download', report }),
      el(
        'ol',
        { key: 'entries', className: 'col' },
        report.checkpoints.map((entry) =>
          el('li', { key: entry.sequence, className: 'card col' }, [
            el(
              'p',
              { key: 'title' },
              `${entry.sequence}. ${entry.report.title || entry.report.url}`
            ),
            el(
              'p',
              { key: 'state', className: 'meta' },
              t('forms.journal.entry', {
                action: t(`forms.journal.action.${entry.action}`),
                fields: entry.report.fields.length,
                time: entry.capturedAt,
              })
            ),
            el(
              'button',
              {
                key: 'show',
                type: 'button',
                'data-form-checkpoint': entry.sequence,
                'aria-expanded': selected === entry.sequence,
                onClick: () =>
                  setSelected(
                    selected === entry.sequence ? null : entry.sequence
                  ),
              },
              t('forms.journal.inspect')
            ),
          ])
        )
      ),
      checkpoint
        ? el('div', { key: checkpoint.sequence, className: 'col' }, [
            el(FormJournalOutcome, { key: 'outcome', checkpoint }),
            el(Report, { key: 'report', report: checkpoint.report }),
          ])
        : null,
    ]
  );
};
