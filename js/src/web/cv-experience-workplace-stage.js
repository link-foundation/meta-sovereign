import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Busy } from './spinner.js';

const el = React.createElement;
const failureKey = {
  'jobs-cv-experience-note': 'workplaceNote',
  'jobs-cv-experience-translation': 'workplaceTranslation',
  'jobs-cv-conflict': 'workplaceConflict',
};
export const CvExperienceWorkplaceStage = ({
  api,
  row,
  jobIndex,
  update,
  onDraft,
}) => {
  const t = useT();
  const [recordId, setRecordId] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const submit = async (event) => {
    event.preventDefault();
    if (active.current) {
      return;
    }
    active.current = true;
    setBusy(true);
    setError(null);
    try {
      const { plan } = await api.vacancyCvWorkplacePlan({
        experience: {
          requestId: row.requestId,
          fingerprint: row.fingerprint,
          jobIndex,
        },
        ...(update && recordId ? { recordId } : {}),
      });
      if (mounted.current) {
        setReceipt(plan);
        onDraft(plan);
      }
    } catch (failure) {
      setError(failureKey[failure.code] ?? 'workplaceError');
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  return el(
    'form',
    {
      className: 'col',
      onSubmit: submit,
      'data-experience-workplace-stage': true,
    },
    [
      update
        ? el('label', { key: 'record', className: 'chat-form-field' }, [
            el(
              'span',
              { key: 'name' },
              t('experiencePlan.workplaceRecordOptional')
            ),
            el('input', {
              key: 'input',
              value: recordId,
              inputMode: 'numeric',
              maxLength: 100,
              pattern: '[0-9]{1,100}',
              disabled: busy,
              'data-experience-workplace-record': true,
              onChange: (event) => {
                setRecordId(event.target.value);
                setReceipt(null);
                setError(null);
              },
            }),
          ])
        : null,
      el('div', { key: 'action', className: 'row wrap' }, [
        el(
          'button',
          {
            key: 'submit',
            type: 'submit',
            disabled:
              busy ||
              (update && recordId !== '' && !/^\d{1,100}$/u.test(recordId)),
          },
          t('experiencePlan.workplaceStage')
        ),
        receipt
          ? el(
              'button',
              {
                key: 'open',
                type: 'button',
                onClick: () => {
                  onDraft(receipt);
                  globalThis.document
                    ?.querySelector('[data-experience-workplace-review]')
                    ?.focus();
                },
              },
              t('experiencePlan.workplaceOpen')
            )
          : null,
      ]),
      busy
        ? el(Busy, { key: 'busy' }, t('experiencePlan.workplaceBusy'))
        : null,
      error
        ? el('p', { key: 'error', role: 'alert' }, t(`experiencePlan.${error}`))
        : null,
      receipt
        ? el(
            'p',
            { key: 'receipt', role: 'status' },
            t('experiencePlan.workplaceDraft', { slot: receipt.browserSlot })
          )
        : null,
    ]
  );
};
