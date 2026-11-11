import React, { useEffect, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useT } from './i18n.js';
import { Busy } from './spinner.js';
import { FormAnswer, FormPlanSummary } from './forms-answer.js';
import { FormPlanControls } from './forms-plan-controls.js';
import { FormReviewControls } from './form-review-controls.js';
import { FormReviewedPlan } from './form-reviewed-plan.js';
import { FormAutomaticResult } from './form-automatic-result.js';
import { FormResumeUpload } from './form-resume-upload.js';
import { FormChoiceInspection } from './form-choice-disclosure.js';
import { FormReportDownloads, FormReportFile } from './form-report-download.js';
import { FormReviewJournal } from './form-review-journal.js';
import { FormResumeSettings } from './form-resume-settings.js';
import { FormModelSettings } from './answer-model-settings.js';
import { FormAssignmentControl } from './form-assignment.js';
export { downloadFormReport } from './form-report-download.js';

const el = React.createElement;
const display = (value) =>
  value === null || value === '' ? '—' : String(value);

const Field = ({
  field,
  selected,
  onSelect,
  onDisclose,
  onAttach,
  busy,
  resume,
}) => {
  const t = useT();
  const flags = ['required', 'disabled', 'readOnly'].filter(
    (key) => field[key]
  );
  return el(
    'li',
    { className: 'card form-field', 'data-form-field': field.id },
    [
      el('h3', { key: 'label' }, field.label || t('forms.unlabelled')),
      onSelect && field.answer?.applySupported
        ? el('label', { key: 'select', className: 'row' }, [
            el('input', {
              key: 'input',
              type: 'checkbox',
              checked: selected,
              disabled: busy,
              'data-form-select': field.id,
              onChange: (event) => onSelect(field.id, event.target.checked),
            }),
            t('forms.fill.select'),
          ])
        : null,
      field.group?.label
        ? el(
            'p',
            { key: 'group', className: 'meta' },
            t('forms.group', { label: field.group.label })
          )
        : null,
      el(
        'p',
        { key: 'source', className: 'meta' },
        t('forms.source', {
          source: t(`forms.label.${field.labelSource}`),
          type: field.type,
          frame: field.frame,
        })
      ),
      field.description
        ? el('p', { key: 'description' }, field.description)
        : null,
      flags.length
        ? el(
            'p',
            { key: 'flags', className: 'meta' },
            flags.map((flag) => t(`forms.${flag}`)).join(' · ')
          )
        : null,
      el(
        'p',
        { key: 'value', className: 'form-current-value' },
        field.valueOmitted
          ? t('forms.omitted', { type: field.valueOmitted })
          : t('forms.value', {
              value: field.indeterminate
                ? t('forms.mixed')
                : field.checked === null
                  ? display(field.value)
                  : t(field.checked ? 'forms.checked' : 'forms.unchecked'),
            })
      ),
      el(FormAnswer, {
        key: 'answer',
        answer: field.answer ?? field.plannedAnswer,
      }),
      el(FormChoiceInspection, { key: 'choices', field, onDisclose, busy }),
      el(FormResumeUpload, { key: 'upload', field, onAttach, busy, resume }),
      field.options.length
        ? el(
            'ul',
            { key: 'options' },
            field.options.map((option, index) =>
              el(
                'li',
                { key: index },
                `${option.selected ? '✓ ' : ''}${option.label}${option.disabled ? ` · ${t('forms.disabled')}` : ''}`
              )
            )
          )
        : null,
    ]
  );
};

export const FormInspectionReport = ({
  report,
  selected,
  onSelect,
  onDisclose,
  onAttach,
  busy,
}) => {
  const t = useT();
  const reasons = [
    ...new Set([
      ...report.omissions.map((item) => item.reason),
      ...report.frames.flatMap((frame) => frame.reasons),
    ]),
  ];
  return el(
    'section',
    { className: 'col forms-report', 'data-form-report': report.coverage },
    [
      el('h2', { key: 'title' }, report.title || t('forms.report')),
      el('p', { key: 'url', className: 'meta' }, report.url),
      el(
        'p',
        { key: 'status', role: 'status' },
        t('forms.count', {
          fields: report.fields.length,
          frames: report.frames.length,
        })
      ),
      el('p', { key: 'scope', className: 'meta' }, t('forms.scope')),
      report.navigation?.nextPage
        ? el(
            'p',
            { key: 'next', role: 'note', 'data-form-next-page': '' },
            t('forms.navigation.next')
          )
        : null,
      el(FormPlanSummary, { key: 'plan', planning: report.planning }),
      report.coverage === 'partial'
        ? el('div', { key: 'partial', role: 'note' }, [
            el('p', { key: 'hint' }, t('forms.partial')),
            el(
              'ul',
              { key: 'reasons' },
              reasons.map((reason) =>
                el('li', { key: reason }, t(`forms.reason.${reason}`))
              )
            ),
          ])
        : null,
      el(FormReportDownloads, { key: 'download', report }),
      el(FormReportFile, { key: 'file', file: report.reportFile }),
      report.fields.length
        ? el(
            'ol',
            { key: 'fields', className: 'form-fields' },
            report.fields.map((field) =>
              el(Field, {
                key: field.id,
                field,
                selected: selected?.includes(field.id),
                onSelect,
                onDisclose,
                onAttach,
                busy,
                resume: report.reviewPlan?.resume,
              })
            )
          )
        : el('p', { key: 'empty' }, t('forms.empty')),
    ]
  );
};

const readErrorKey = (error) =>
  [
    'form-url',
    'form-busy',
    'form-changed',
    'form-timeout',
    'form-stopped',
    'browser-unavailable',
    'bad-browser-policy',
    'server-required',
  ].includes(error)
    ? error
    : 'form-read-failed';

const useFormCapability = (api, probe) => {
  const [capability, setCapability] = useState(null);
  useEffect(() => {
    let current = true;
    Promise.resolve()
      .then(() => api.formsCapabilities())
      .then(
        (value) => {
          if (current) {
            setCapability(value ?? { available: false });
          }
        },
        () => {
          if (current) {
            setCapability({ available: false });
          }
        }
      );
    return () => {
      current = false;
    };
  }, [api, probe]);
  return [capability, setCapability];
};

const FormReportView = ({ report, plan, ...props }) =>
  report?.mode === 'review-journal'
    ? el(FormReviewJournal, {
        key: report.capturedAt,
        report,
        Report: FormInspectionReport,
      })
    : plan?.mode === 'prefill-result'
      ? el(FormAutomaticResult, { result: plan, Report: FormInspectionReport })
      : plan?.reviewPlan
        ? el(FormReviewedPlan, {
            ...props,
            key: plan.reviewPlan.id,
            plan,
            Report: FormInspectionReport,
          })
        : report
          ? el(FormInspectionReport, { report: plan ?? report })
          : null;

const FormSettings = ({ api, busy, setBusy, setPlan }) =>
  el(React.Fragment, null, [
    el(FormModelSettings, {
      key: 'model',
      api,
      busy,
      setBusy,
      onChanged: () => setPlan(null),
    }),
    api.formsResume
      ? el(FormResumeSettings, {
          key: 'resume',
          api,
          busy,
          setBusy,
          onChanged: () => setPlan(null),
        })
      : null,
  ]);

const AssignmentSection = ({
  report,
  plan,
  linkedAssignment,
  setLinkedAssignment,
  setPlan,
  ...props
}) => {
  const assignment =
    (plan?.report ?? plan)?.planning?.assignment ?? linkedAssignment;
  return assignment && report
    ? el(FormAssignmentControl, {
        ...props,
        key: assignment.id,
        inspection: report,
        assignment,
        onLinked: (value) => {
          setLinkedAssignment(value);
          setPlan(null);
        },
      })
    : null;
};

export const FormsView = ({ api = defaultApi }) => {
  const t = useT();
  const [url, setUrl] = useState('');
  const [slot, setSlot] = useState('forms');
  const [probe, setProbe] = useState(0);
  const [capability, setCapability] = useFormCapability(api, probe);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [plan, setPlan] = useState(null);
  const [linkedAssignment, setLinkedAssignment] = useState(null);
  const read = async (event) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setReading(true);
    setError(null);
    try {
      const value = await api.formsRead({ url, browserSlot: slot });
      if (!value?.ok) {
        setError(value?.code ?? 'form-read-failed');
      } else {
        setReport(value);
        setPlan(null);
        setLinkedAssignment(null);
      }
    } catch (error) {
      setError(error.code ?? 'form-read-failed');
    } finally {
      setBusy(false);
      setReading(false);
    }
  };
  return el(
    'section',
    { className: 'col forms-view', 'data-view-content': 'forms' },
    [
      el('h1', { key: 'title' }, t('forms.title')),
      el('p', { key: 'hint', className: 'meta' }, t('forms.hint')),
      el(FormSettings, { key: 'settings', api, busy, setBusy, setPlan }),
      capability === null
        ? el(Busy, { key: 'loading' }, t('forms.loading'))
        : null,
      capability?.available === false
        ? el('div', { key: 'offline', role: 'status' }, [
            el('p', { key: 'hint' }, t('forms.unavailable')),
            el(
              'button',
              {
                key: 'retry',
                type: 'button',
                onClick: () => {
                  setCapability(null);
                  setProbe((n) => n + 1);
                },
              },
              t('forms.retry')
            ),
          ])
        : null,
      el('form', { key: 'form', className: 'col', onSubmit: read }, [
        el('label', { key: 'url', className: 'col' }, [
          t('forms.url'),
          el('input', {
            key: 'input',
            type: 'url',
            required: true,
            value: url,
            onChange: (event) => setUrl(event.target.value),
            'data-form-url': '',
            disabled: busy,
          }),
        ]),
        el('label', { key: 'slot', className: 'col' }, [
          t('forms.slot'),
          el('input', {
            key: 'input',
            required: true,
            pattern: '[a-z0-9_\\-]{1,64}',
            value: slot,
            onChange: (event) => setSlot(event.target.value),
            'data-form-slot': '',
            disabled: busy,
          }),
        ]),
        el('p', { key: 'slotHint', className: 'meta' }, t('forms.slotHint')),
        el(
          'button',
          {
            key: 'read',
            type: 'submit',
            className: 'primary',
            disabled: busy || !capability?.available,
            'aria-busy': reading,
            'data-action': 'read-form',
          },
          t(reading ? 'forms.reading' : 'forms.read')
        ),
      ]),
      error
        ? el(
            'p',
            { key: 'error', role: 'alert', 'data-form-error': error },
            t(`forms.error.${readErrorKey(error)}`)
          )
        : null,
      el(FormReviewControls, {
        key: 'reviews',
        api,
        url,
        slot,
        available: capability?.review,
        busy,
        setBusy,
        onReport: (value) => {
          setReport(value);
          setPlan(null);
          setLinkedAssignment(null);
        },
      }),
      report && report.mode !== 'review-journal'
        ? el(FormPlanControls, {
            key: report.capturedAt,
            api,
            report,
            available: capability?.plan,
            prefillAvailable: capability?.prefill,
            busy,
            setBusy,
            onPlan: setPlan,
          })
        : null,
      el(AssignmentSection, {
        key: 'assignment',
        api,
        report,
        plan,
        linkedAssignment,
        busy,
        setBusy,
        setLinkedAssignment,
        setPlan,
      }),
      el(FormReportView, { key: 'report', report, plan, api, busy, setBusy }),
    ]
  );
};
