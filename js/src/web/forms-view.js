import React, { useEffect, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useT } from './i18n.js';
import { Busy } from './spinner.js';
import { FormAnswer, FormPlanSummary } from './forms-answer.js';
import { FormPlanControls } from './forms-plan-controls.js';

const el = React.createElement;
const display = (value) =>
  value === null || value === '' ? '—' : String(value);

export const downloadFormReport = (report) => {
  const href = URL.createObjectURL(
    new globalThis.Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    })
  );
  const anchor = globalThis.document.createElement('a');
  anchor.href = href;
  anchor.download = `form-${report.mode === 'answer-plan' ? 'plan' : 'inspection'}-${report.capturedAt.replace(/[:.]/gu, '-')}.json`;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(href), 1000);
};

const Field = ({ field }) => {
  const t = useT();
  const flags = ['required', 'disabled', 'readOnly'].filter(
    (key) => field[key]
  );
  return el(
    'li',
    { className: 'card form-field', 'data-form-field': field.id },
    [
      el('h3', { key: 'label' }, field.label || t('forms.unlabelled')),
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
      el(FormAnswer, { key: 'answer', answer: field.answer }),
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

export const FormInspectionReport = ({ report }) => {
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
      el(
        'button',
        {
          key: 'download',
          type: 'button',
          onClick: () => downloadFormReport(report),
          'data-action': 'download-form-report',
        },
        t('forms.download')
      ),
      report.fields.length
        ? el(
            'ol',
            { key: 'fields', className: 'form-fields' },
            report.fields.map((field) => el(Field, { key: field.id, field }))
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

export const FormsView = ({ api = defaultApi }) => {
  const t = useT();
  const [url, setUrl] = useState('');
  const [slot, setSlot] = useState('forms');
  const [capability, setCapability] = useState(null);
  const [probe, setProbe] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [plan, setPlan] = useState(null);
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
      }
    } catch (error) {
      setError(error.code ?? 'form-read-failed');
    } finally {
      setBusy(false);
      setReading(false);
    }
  };
  const errorKey = readErrorKey(error);
  return el(
    'section',
    { className: 'col forms-view', 'data-view-content': 'forms' },
    [
      el('h1', { key: 'title' }, t('forms.title')),
      el('p', { key: 'hint', className: 'meta' }, t('forms.hint')),
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
            t(`forms.error.${errorKey}`)
          )
        : null,
      report
        ? el(FormPlanControls, {
            key: report.capturedAt,
            api,
            report,
            available: capability?.plan,
            busy,
            setBusy,
            onPlan: setPlan,
          })
        : null,
      report
        ? el(FormInspectionReport, { key: 'report', report: plan ?? report })
        : null,
    ]
  );
};
