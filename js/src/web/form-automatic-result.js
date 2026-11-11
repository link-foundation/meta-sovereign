import React from 'react';
import { useT } from './i18n.js';
import { FormApplicationResult } from './form-reviewed-plan.js';
import { FormResumeUploadResult } from './form-resume-upload.js';
import { formReportSnapshot } from '../forms/review-journal.js';
import { pendingPrefill } from '../forms/challenge-wait.js';

const el = React.createElement;
export const FormAutomaticResult = ({ result, Report }) => {
  const t = useT();
  const report = formReportSnapshot(result);
  if (pendingPrefill(result)) {
    return el(
      'section',
      {
        className: 'card col',
        role: 'status',
        'data-form-automatic-result': result.state,
      },
      [
        el('h2', { key: 'title' }, t('forms.automatic.title')),
        el('p', { key: 'state' }, t(`forms.automatic.state.${result.state}`)),
        result.wait
          ? el(
              'p',
              { key: 'wait', className: 'meta' },
              t('forms.automatic.wait', { time: result.wait.expiresAt })
            )
          : null,
      ]
    );
  }
  return el(
    'section',
    { className: 'col', 'data-form-automatic-result': result.state },
    [
      el('h2', { key: 'title' }, t('forms.automatic.title')),
      el(FormApplicationResult, {
        key: 'receipts',
        result,
        stateKey: 'forms.automatic.state',
      }),
      ...result.uploads.map((upload) =>
        el('div', { key: upload.fieldId, className: 'col' }, [
          el(
            'p',
            { key: 'field', className: 'meta' },
            result.report?.fields?.find((field) => field.id === upload.fieldId)
              ?.label || upload.fieldId
          ),
          el(FormResumeUploadResult, { key: 'result', result: upload }),
        ])
      ),
      el(
        'p',
        { key: 'count' },
        t('forms.automatic.unresolved', { count: result.unresolved.length })
      ),
      result.unresolved.length
        ? el(
            'ul',
            { key: 'unresolved' },
            result.unresolved.map((field) =>
              el('li', { key: field.fieldId }, field.label || field.fieldId)
            )
          )
        : null,
      el(
        'p',
        { key: 'next', className: 'meta' },
        t(result.nextPage ? 'forms.automatic.next' : 'forms.automatic.review')
      ),
      report
        ? el(Report, {
            key: 'report',
            report: { ...report, reportFile: result.reportFile },
          })
        : null,
    ]
  );
};
