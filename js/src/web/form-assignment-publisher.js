import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
const el = React.createElement;

const DraftReview = ({ draft }) => {
  const t = useT();
  return el('div', { className: 'col', 'data-assignment-draft': draft.id }, [
    el(
      'p',
      { key: 'target' },
      `${draft.target} · ${t(`assignment.visibility.${draft.visibility}`)}`
    ),
    el(
      'p',
      { key: 'template' },
      t('assignment.template', {
        repository: draft.template,
        source: t(`assignment.source.${draft.catalogSource}`),
      })
    ),
    el(
      'p',
      { key: 'action' },
      t(`assignment.template.${draft.templateAction}`)
    ),
    draft.vacancyEvidence?.url
      ? el(
          'a',
          {
            key: 'vacancy',
            href: draft.vacancyEvidence.url,
            target: '_blank',
            rel: 'noreferrer',
          },
          t('assignment.vacancy-used', {
            title: draft.vacancyEvidence.vacancy.title,
          })
        )
      : null,
    draft.sourceEvidence
      ? el('p', { key: 'source', 'data-assignment-source-evidence': '' }, [
          el(
            'a',
            {
              key: 'link',
              href: draft.sourceEvidence.url,
              target: '_blank',
              rel: 'noreferrer',
            },
            t('assignment.instructions-used', {
              title: draft.sourceEvidence.title || draft.sourceEvidence.url,
            })
          ),
          ' · ',
          el(
            'time',
            { key: 'time', dateTime: draft.sourceEvidence.capturedAt },
            new Date(draft.sourceEvidence.capturedAt).toLocaleString()
          ),
        ])
      : null,
    el('h3', { key: 'title' }, draft.title),
    el(
      'pre',
      {
        key: 'body',
        style: {
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          maxHeight: '24rem',
          overflow: 'auto',
        },
      },
      draft.body
    ),
  ]);
};

const PublisherFields = ({
  busy,
  attempted,
  target,
  setTarget,
  visibility,
  setVisibility,
  vacancyUrl,
  setVacancyUrl,
  sourceUrl,
  setSourceUrl,
  employers,
  setEmployers,
  refresh,
  setRefresh,
  change,
  preview,
  working,
}) => {
  const t = useT();
  const disabled = busy || attempted;
  const input = (key, label, value, setter, attributes = {}) =>
    el('label', { key, className: 'col' }, [
      t(label),
      el('input', {
        key: 'input',
        value,
        onChange: change(setter),
        disabled,
        'data-assignment-publish-input': key,
        ...attributes,
      }),
    ]);
  return el('form', { key: 'form', className: 'col', onSubmit: preview }, [
    input('target', 'assignment.target', target, setTarget, {
      required: true,
      maxLength: 140,
      placeholder: 'owner/repository',
    }),
    el('label', { key: 'visibility', className: 'col' }, [
      t('assignment.visibility'),
      el(
        'select',
        {
          key: 'input',
          value: visibility,
          onChange: change(setVisibility),
          disabled,
          'data-assignment-publish-input': 'visibility',
        },
        ['private', 'public'].map((value) =>
          el(
            'option',
            { key: value, value },
            t(`assignment.visibility.${value}`)
          )
        )
      ),
    ]),
    input('vacancy', 'assignment.vacancy', vacancyUrl, setVacancyUrl, {
      type: 'url',
      maxLength: 4000,
    }),
    input('source', 'assignment.instructions', sourceUrl, setSourceUrl, {
      type: 'url',
      maxLength: 4000,
    }),
    el(
      'p',
      { key: 'source-hint', className: 'meta' },
      t('assignment.instructions-hint')
    ),
    el('label', { key: 'refresh', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked: refresh,
        onChange: change(setRefresh),
        disabled,
      }),
      t('assignment.refresh'),
    ]),
    el('label', { key: 'employers', className: 'col' }, [
      t('assignment.employers'),
      el('textarea', {
        key: 'input',
        value: employers,
        maxLength: 4000,
        onChange: change(setEmployers),
        disabled,
        'data-assignment-publish-input': 'employers',
      }),
    ]),
    el(
      'button',
      {
        key: 'draft',
        type: 'submit',
        disabled,
        'data-action': 'draft-assignment',
      },
      t(working === 'drafting' ? 'assignment.drafting' : 'assignment.draft')
    ),
  ]);
};

const useAssignmentOperation = (busy, setBusy) => {
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(null);
  const perform = async (kind, operation) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setWorking(kind);
    setError(null);
    try {
      await operation();
    } catch (failure) {
      setError(failure.code ?? 'assignment-unconfirmed');
    } finally {
      setBusy(false);
      setWorking(null);
    }
  };
  return { error, setError, working, perform };
};

const RestoreAssignment = ({
  api,
  inspection,
  assignment,
  busy,
  perform,
  onRestored,
}) => {
  const t = useT();
  if (!api.restoreFormAssignment) {
    return null;
  }
  return el(
    'button',
    {
      type: 'button',
      disabled: busy,
      'data-action': 'restore-assignment',
      onClick: () =>
        perform('restoring', async () => {
          const response = await api.restoreFormAssignment({
            inspection,
            revision: assignment.revision,
          });
          onRestored(response);
        }),
    },
    t('assignment.restore')
  );
};

const PublicationFeedback = ({ result, error }) => {
  const t = useT();
  return el(React.Fragment, null, [
    result?.ok
      ? el(
          'p',
          { key: 'success', role: 'status', 'data-assignment-published': '' },
          [
            t('assignment.verified'),
            ' ',
            el(
              'a',
              {
                key: 'issue',
                href: result.issue.url,
                target: '_blank',
                rel: 'noreferrer',
              },
              result.issue.url
            ),
          ]
        )
      : null,
    result?.state === 'uncertain'
      ? el(
          'p',
          { key: 'uncertain', role: 'alert' },
          t('assignment.uncertain', { code: result.code, stage: result.stage })
        )
      : null,
    error
      ? el(
          'p',
          {
            key: 'error',
            role: 'alert',
            'data-assignment-publish-error': error,
          },
          t('assignment.error', { code: error })
        )
      : null,
  ]);
};

export const FormAssignmentPublisher = ({
  api,
  inspection,
  assignment,
  busy,
  setBusy,
  onLinked,
}) => {
  const t = useT();
  const [target, setTarget] = useState(assignment.repository?.fullName ?? '');
  const [visibility, setVisibility] = useState('private');
  const [vacancyUrl, setVacancyUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [employers, setEmployers] = useState('');
  const [refresh, setRefresh] = useState(false);
  const [draft, setDraft] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState(null);
  const { error, setError, working, perform } = useAssignmentOperation(
    busy,
    setBusy
  );
  useEffect(() => {
    setDraft(null);
    setAttempted(false);
    setError(null);
    setResult((value) =>
      value?.assignment?.revision === assignment.revision ? value : null
    );
  }, [assignment.revision]);
  const change = (setter) => (event) => {
    setter(
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    );
    setDraft(null);
    setResult(null);
    setError(null);
  };
  const preview = (event) => {
    event.preventDefault();
    return perform('drafting', async () => {
      const response = await api.draftFormAssignment({
        inspection,
        revision: assignment.revision,
        target,
        visibility,
        vacancyUrl: vacancyUrl || undefined,
        sourceUrl: sourceUrl || undefined,
        employers: employers
          .split('\n')
          .map((name) => name.trim())
          .filter(Boolean),
        refreshVacancy: refresh,
      });
      setDraft(response.draft);
      setResult(null);
      setAttempted(false);
    });
  };
  const publish = () =>
    perform('publishing', async () => {
      setAttempted(true);
      const response = await api.publishFormAssignment(draft);
      setResult(response);
      if (response.ok) {
        onLinked(response.assignment);
      }
    });
  return el('section', { className: 'col', 'data-assignment-publisher': '' }, [
    el('h3', { key: 'heading' }, t('assignment.title')),
    el('p', { key: 'hint', className: 'meta' }, t('assignment.hint')),
    el(RestoreAssignment, {
      key: 'restore',
      api,
      inspection,
      assignment,
      busy,
      perform,
      onRestored: (response) => {
        setTarget(response.draft.target);
        setVisibility(response.draft.visibility);
        setSourceUrl(response.draft.sourceEvidence?.requestedUrl ?? '');
        setDraft(response.draft);
        setAttempted(response.attempted);
        setResult(null);
      },
    }),
    el(PublisherFields, {
      key: 'form',
      busy,
      attempted,
      target,
      setTarget,
      visibility,
      setVisibility,
      vacancyUrl,
      setVacancyUrl,
      sourceUrl,
      setSourceUrl,
      employers,
      setEmployers,
      refresh,
      setRefresh,
      change,
      preview,
      working,
    }),
    draft ? el(DraftReview, { key: 'review', draft }) : null,
    draft
      ? el(
          'button',
          {
            key: 'publish',
            type: 'button',
            disabled: busy,
            onClick: publish,
            'data-action': 'publish-assignment',
          },
          t(
            working === 'publishing'
              ? 'assignment.publishing'
              : attempted
                ? 'assignment.recover'
                : 'assignment.publish'
          )
        )
      : null,
    el(PublicationFeedback, { key: 'feedback', result, error }),
  ]);
};
