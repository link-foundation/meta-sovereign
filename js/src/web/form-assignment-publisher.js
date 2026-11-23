import React, { useEffect, useId, useState } from 'react';
import { useT } from './i18n.js';
import { ASSIGNMENT_LANGUAGES } from '../assignments/templates.js';
import { PROVIDED_ASSIGNMENT_SCOPE } from '../assignments/source.js';
const el = React.createElement;

const SourceEvidence = ({ evidence }) => {
  const t = useT();
  return el('p', { 'data-assignment-source-evidence': '' }, [
    evidence.scope === PROVIDED_ASSIGNMENT_SCOPE
      ? t('assignment.instructions-pasted')
      : el(
          'a',
          {
            key: 'link',
            href: evidence.url,
            target: '_blank',
            rel: 'noreferrer',
          },
          t('assignment.instructions-used', {
            title: evidence.title || evidence.url,
          })
        ),
    ' · ',
    el(
      'time',
      { key: 'time', dateTime: evidence.capturedAt },
      new Date(evidence.capturedAt).toLocaleString()
    ),
  ]);
};

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
      { key: 'language', 'data-assignment-language': draft.language },
      t(
        draft.languageOverride
          ? 'assignment.language-owner'
          : 'assignment.language-reviewed',
        { language: ASSIGNMENT_LANGUAGES[draft.language] }
      )
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
      ? el(SourceEvidence, { key: 'source', evidence: draft.sourceEvidence })
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

const PastedInstructions = ({ value, onChange, disabled }) => {
  const t = useT();
  const id = useId();
  return el('div', { className: 'col' }, [
    el(
      'label',
      { key: 'label', htmlFor: id },
      t('assignment.instructions-text')
    ),
    el('textarea', {
      key: 'input',
      id,
      value,
      onChange,
      disabled,
      maxLength: 30000,
      rows: 5,
      'data-assignment-publish-input': 'source-text',
    }),
  ]);
};

const PublisherFields = ({
  busy,
  attempted,
  target,
  setTarget,
  visibility,
  setVisibility,
  language,
  setLanguage,
  vacancyUrl,
  setVacancyUrl,
  sourceUrl,
  setSourceUrl,
  standalone,
  sourceText,
  setSourceText,
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
  const sourceReady =
    !standalone || Boolean(sourceUrl.trim()) !== Boolean(sourceText.trim());
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
  const select = (key, label, value, setter, options) =>
    el('label', { key, className: 'col' }, [
      t(label),
      el(
        'select',
        {
          key: 'input',
          value,
          onChange: change(setter),
          disabled,
          'data-assignment-publish-input': key,
        },
        options.map(([value, label]) =>
          el('option', { key: value, value }, label)
        )
      ),
    ]);
  return el('form', { key: 'form', className: 'col', onSubmit: preview }, [
    input('target', 'assignment.target', target, setTarget, {
      required: true,
      maxLength: 140,
      placeholder: 'owner/repository',
    }),
    select('visibility', 'assignment.visibility', visibility, setVisibility, [
      ['private', t('assignment.visibility.private')],
      ['public', t('assignment.visibility.public')],
    ]),
    input('vacancy', 'assignment.vacancy', vacancyUrl, setVacancyUrl, {
      spellCheck: false,
      maxLength: 4000,
    }),
    select('language', 'assignment.language', language, setLanguage, [
      ['', t('assignment.language-auto')],
      ...Object.entries(ASSIGNMENT_LANGUAGES),
    ]),
    input('source', 'assignment.instructions', sourceUrl, setSourceUrl, {
      type: 'url',
      maxLength: 4000,
    }),
    el(
      'p',
      { key: 'source-hint', className: 'meta' },
      t('assignment.instructions-hint')
    ),
    standalone
      ? el(PastedInstructions, {
          key: 'pasted',
          value: sourceText,
          onChange: change(setSourceText),
          disabled,
        })
      : null,
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
        disabled: disabled || !sourceReady,
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

const RestoreAssignment = ({ api, input, busy, perform, onRestored }) => {
  const t = useT();
  if (!api.restoreFormAssignment) {
    return null;
  }
  return el(
    'button',
    {
      type: 'button',
      disabled: busy || (input.standalone && !input.target.trim()),
      'data-action': 'restore-assignment',
      onClick: () =>
        perform('restoring', async () => {
          const response = await api.restoreFormAssignment(input);
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

const PublishAssignmentButton = ({ busy, publish, working, attempted }) => {
  const t = useT();
  const label =
    working === 'publishing' ? 'publishing' : attempted ? 'recover' : 'publish';
  return el(
    'button',
    {
      type: 'button',
      disabled: busy,
      onClick: publish,
      'data-action': 'publish-assignment',
    },
    t(`assignment.${label}`)
  );
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
  const standalone = !inspection;
  const revision = assignment?.revision;
  const [target, setTarget] = useState(assignment?.repository?.fullName ?? '');
  const binding = standalone
    ? { standalone: true, target }
    : { inspection, revision };
  const [visibility, setVisibility] = useState('private');
  const [language, setLanguage] = useState('');
  const [vacancyUrl, setVacancyUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceText, setSourceText] = useState('');
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
      value?.assignment?.revision === revision ? value : null
    );
  }, [revision]);
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
        ...binding,
        target,
        visibility,
        languageOverride: language || undefined,
        vacancyUrl: vacancyUrl || undefined,
        sourceUrl: sourceUrl || undefined,
        sourceText: sourceText.trim() ? sourceText : undefined,
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
        if (standalone) {
          setDraft(null);
          setAttempted(false);
        } else {
          onLinked(response.assignment);
        }
      }
    });
  return el('section', { className: 'col', 'data-assignment-publisher': '' }, [
    el('h3', { key: 'heading' }, t('assignment.title')),
    el(
      'p',
      { key: 'hint', className: 'meta' },
      t(standalone ? 'assignment.standalone-hint' : 'assignment.hint')
    ),
    el(RestoreAssignment, {
      key: 'restore',
      api,
      input: binding,
      busy,
      perform,
      onRestored: ({ draft: saved, sourceText: text, attempted: issued }) => {
        const vacancy = saved.vacancyEvidence;
        setTarget(saved.target);
        setVisibility(saved.visibility);
        setLanguage(saved.languageOverride ?? '');
        setVacancyUrl(vacancy.source === 'url' ? vacancy.url : '');
        setRefresh(false);
        setSourceUrl(saved.sourceEvidence?.requestedUrl ?? '');
        setSourceText(text ?? '');
        setDraft(saved);
        setAttempted(issued);
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
      language,
      setLanguage,
      vacancyUrl,
      setVacancyUrl,
      sourceUrl,
      setSourceUrl,
      standalone,
      sourceText,
      setSourceText,
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
      ? el(PublishAssignmentButton, {
          key: 'publish',
          busy,
          publish,
          working,
          attempted,
        })
      : null,
    el(PublicationFeedback, { key: 'feedback', result, error }),
  ]);
};

export const StandaloneAssignmentPublisher = ({
  api,
  busy,
  setBusy,
  available,
}) => {
  const t = useT();
  const [opened, setOpened] = useState(false);
  if (!available || !api.draftFormAssignment || !api.publishFormAssignment) {
    return null;
  }
  return el(
    'details',
    {
      'data-standalone-assignment': '',
      onToggle: (event) => {
        if (event.currentTarget.open) {
          setOpened(true);
        }
      },
    },
    [
      el('summary', { key: 'summary' }, t('assignment.standalone')),
      opened
        ? el(FormAssignmentPublisher, { key: 'publisher', api, busy, setBusy })
        : null,
    ]
  );
};
