import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const ProfileImport = ({ api, profile, set, disabled = false }) => {
  const t = useT();
  const [sources, setSources] = React.useState([]);
  const [cvId, setCvId] = React.useState('');
  const [text, setText] = React.useState('');
  const [draft, setDraft] = React.useState(null);
  const [selected, setSelected] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const active = React.useRef(false);
  const current = React.useRef('');
  current.current = JSON.stringify({ cvId, text, profile });
  const clear = () => {
    setDraft(null);
    setSelected({});
    setNotice('');
  };
  const run = async (work) => {
    if (active.current) {
      return;
    }
    active.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (err) {
      setError(err.message);
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  const preview = () =>
    run(async () => {
      const basis = current.current;
      clear();
      const result = await api.extractAnswerProfile({ cvId, text, profile });
      if (current.current !== basis) {
        throw new Error(t('questions.importChanged'));
      }
      setDraft({ ...result, basis });
    });
  const apply = () => {
    if (draft.basis !== current.current) {
      setError(t('questions.importChanged'));
      clear();
      return;
    }
    set({
      ...profile,
      ...Object.fromEntries(
        Object.entries(selected).filter(([, value]) => value !== undefined)
      ),
    });
    clear();
    setNotice(t('questions.importApplied'));
  };
  return el('details', { 'data-profile-import': true }, [
    el('summary', { key: 's' }, t('questions.importProfile')),
    el('p', { key: 'hint', className: 'meta' }, t('questions.importHint')),
    el(
      'fieldset',
      { key: 'fields', className: 'col', disabled: disabled || busy },
      [
        el(
          'button',
          {
            key: 'load',
            type: 'button',
            onClick: () =>
              run(async () => {
                const result = await api.answerProfileSources();
                setSources(result.sources);
                clear();
                setNotice(
                  t(
                    result.sources.length
                      ? 'questions.importSourcesLoaded'
                      : 'questions.importNoSources'
                  )
                );
              }),
          },
          t('questions.importLoadSources')
        ),
        el(ProfileSourceInput, {
          key: 'sources',
          sources,
          cvId,
          setCvId,
          text,
          setText,
          clear,
        }),
        el(
          'button',
          {
            key: 'preview',
            type: 'button',
            disabled: !cvId && !text.trim(),
            onClick: preview,
          },
          t('questions.importPreview')
        ),
        el(ProfileDraft, { key: 'draft', draft, selected, setSelected, apply }),
      ]
    ),
    busy ? el('p', { key: 'busy', role: 'status' }, t('common.loading')) : null,
    error ? el('p', { key: 'error', role: 'alert' }, error) : null,
    notice ? el('p', { key: 'notice', role: 'status' }, notice) : null,
  ]);
};

const ProfileDraft = ({ draft, selected, setSelected, apply }) => {
  const t = useT();
  return draft
    ? el(
        'div',
        { key: 'draft', className: 'col', 'data-profile-draft': true },
        [
          !draft.fields.length
            ? el('p', { key: 'empty' }, t('questions.importNoFields'))
            : null,
          ...draft.fields.map((field) =>
            el('fieldset', { key: field.key, className: 'col' }, [
              el('legend', { key: 'legend' }, field.key),
              field.conflict
                ? el(
                    'p',
                    { key: 'conflict', className: 'meta' },
                    t('questions.importConflict')
                  )
                : null,
              field.current !== null
                ? el(
                    'p',
                    {
                      key: 'current',
                      style: {
                        overflowWrap: 'anywhere',
                        whiteSpace: 'pre-wrap',
                      },
                    },
                    t('questions.importCurrent', { value: field.current })
                  )
                : null,
              ...field.candidates.map((candidate, index) =>
                el('label', { key: index, className: 'col' }, [
                  el('span', { key: 'choice', className: 'row' }, [
                    el('input', {
                      key: 'input',
                      type: 'checkbox',
                      'aria-label': `${field.key}: ${candidate.value}`,
                      checked: selected[field.key] === candidate.value,
                      onChange: (event) =>
                        setSelected((old) => ({
                          ...old,
                          [field.key]: event.target.checked
                            ? candidate.value
                            : undefined,
                        })),
                    }),
                    el(
                      'span',
                      {
                        key: 'value',
                        style: {
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          minWidth: 0,
                        },
                      },
                      candidate.value
                    ),
                  ]),
                  el(
                    'small',
                    { key: 'evidence', className: 'meta' },
                    candidate.evidence
                      .map(
                        (e) =>
                          `${e.source} · ${e.path}${e.capturedAt ? ` · ${e.capturedAt}` : ''}`
                      )
                      .join('\n')
                  ),
                ])
              ),
            ])
          ),
          draft.skipped.length
            ? el(
                'p',
                { key: 'skipped', className: 'meta' },
                t('questions.importSkipped', {
                  count: draft.skipped.length,
                })
              )
            : null,
          el(
            'button',
            {
              key: 'apply',
              type: 'button',
              disabled: !Object.values(selected).some(
                (value) => value !== undefined
              ),
              onClick: apply,
            },
            t('questions.importApply')
          ),
        ]
      )
    : null;
};

const ProfileSourceInput = ({
  sources,
  cvId,
  setCvId,
  text,
  setText,
  clear,
}) => {
  const t = useT();
  return el(React.Fragment, null, [
    el('label', { key: 'cv', className: 'field' }, [
      el(
        'span',
        { key: 'l', className: 'field-label' },
        t('questions.importCv')
      ),
      el(
        'select',
        {
          key: 'input',
          'aria-label': t('questions.importCv'),
          value: cvId,
          onChange: (event) => {
            setCvId(event.target.value);
            clear();
          },
        },
        [
          el('option', { key: '', value: '' }, t('questions.importNoCv')),
          ...sources.map((source) =>
            el(
              'option',
              { key: source.id, value: source.id },
              `${source.id}${source.capturedAt ? ` · ${source.capturedAt}` : ''}`
            )
          ),
        ]
      ),
    ]),
    el('label', { key: 'text', className: 'field' }, [
      el(
        'span',
        { key: 'l', className: 'field-label' },
        t('questions.importText')
      ),
      el('textarea', {
        key: 'input',
        'aria-label': t('questions.importText'),
        rows: 4,
        maxLength: 64000,
        value: text,
        onChange: (event) => {
          setText(event.target.value);
          clear();
        },
      }),
    ]),
  ]);
};
