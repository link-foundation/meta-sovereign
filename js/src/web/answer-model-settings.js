import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const ModelDraftControl = ({ value, set, busy }) => {
  const t = useT();
  return el('label', { className: 'row' }, [
    el('input', {
      key: 'input',
      type: 'checkbox',
      checked: value,
      disabled: busy,
      'data-model-draft-opt-in': '',
      onChange: (event) => set(event.target.checked),
    }),
    t('answerModel.optIn'),
  ]);
};

export const AnswerModelStatus = ({ model }) => {
  const t = useT();
  return model?.state
    ? el(
        'p',
        {
          className: 'meta',
          role: 'status',
          'data-answer-model-state': model.state,
        },
        t(`answerModel.state.${model.state}`, {
          code: model.code ?? '',
          count: model.requested ?? 1,
          omitted: model.omitted ?? 0,
        })
      )
    : null;
};

const ModelFields = ({ draft, setDraft, sources, disabled }) => {
  const t = useT();
  const update = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return el('fieldset', { disabled, className: 'col' }, [
    el('label', { key: 'enabled', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked: draft.enabled,
        'data-answer-model-enabled': '',
        onChange: (event) => update('enabled', event.target.checked),
      }),
      t('answerModel.enable'),
    ]),
    el('label', { key: 'model', className: 'col' }, [
      t('answerModel.model'),
      el('input', {
        key: 'input',
        value: draft.model,
        maxLength: 160,
        'data-answer-model-name': '',
        onChange: (event) => update('model', event.target.value),
      }),
    ]),
    el('label', { key: 'cv', className: 'col' }, [
      t('answerModel.cv'),
      el(
        'select',
        {
          key: 'select',
          value: draft.cvId,
          'data-answer-model-cv': '',
          onChange: (event) => update('cvId', event.target.value),
        },
        [
          el('option', { key: 'none', value: '' }, t('answerModel.noCv')),
          ...(draft.cvId && !sources.some((source) => source.id === draft.cvId)
            ? [
                el(
                  'option',
                  { key: 'missing', value: draft.cvId },
                  `${draft.cvId} (${t('answerModel.cvMissing')})`
                ),
              ]
            : []),
          ...sources.map((source) =>
            el('option', { key: source.id, value: source.id }, source.id)
          ),
        ]
      ),
    ]),
    el('label', { key: 'timeout', className: 'col' }, [
      t('answerModel.timeout'),
      el('input', {
        key: 'input',
        type: 'number',
        min: 1000,
        max: 120000,
        step: 1000,
        value: draft.timeoutMs,
        'data-answer-model-timeout': '',
        onChange: (event) => update('timeoutMs', event.target.value),
      }),
    ]),
  ]);
};

export const AnswerModelSettings = ({
  api,
  busy,
  run,
  onChanged = () => {},
}) => {
  const t = useT();
  const [draft, setDraft] = useState(null);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [probe, setProbe] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true);
    Promise.all([api.answerModel(), api.answerProfileSources()])
      .then(
        ([result, cvs]) => {
          if (current) {
            setDraft(result.settings);
            setSources(cvs.sources);
            setError(null);
            setSaved(false);
          }
        },
        (failure) => {
          if (current) {
            setError(failure.code ?? 'answer-model-unconfirmed');
          }
        }
      )
      .finally(() => {
        if (current) {
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [api, probe]);
  const save = () =>
    run(async () => {
      if (loading || error || !draft) {
        return;
      }
      try {
        const result = await api.saveAnswerModel({
          ...draft,
          timeoutMs: Number(draft.timeoutMs),
        });
        setDraft(result.settings);
        setSaved(true);
        onChanged();
      } catch (failure) {
        setError(failure.code ?? 'answer-model-unconfirmed');
      }
    });
  return el(
    'details',
    { className: 'card col', 'data-answer-model-settings': '' },
    [
      el('summary', { key: 'title' }, t('answerModel.title')),
      el('p', { key: 'hint', className: 'meta' }, t('answerModel.hint')),
      loading
        ? el('p', { key: 'loading', role: 'status' }, t('common.loading'))
        : null,
      draft
        ? el(ModelFields, {
            key: 'fields',
            draft,
            sources,
            disabled: busy || loading,
            setDraft: (change) => {
              setDraft(change);
              setSaved(false);
            },
          })
        : null,
      el('div', { key: 'actions', className: 'row' }, [
        el(
          'button',
          {
            key: 'save',
            type: 'button',
            disabled: busy || loading || Boolean(error) || !draft,
            'data-save-answer-model': '',
            onClick: save,
          },
          t('answerModel.save')
        ),
        el(
          'button',
          {
            key: 'reload',
            type: 'button',
            disabled: busy || loading,
            'data-reload-answer-model': '',
            onClick: () => setProbe((value) => value + 1),
          },
          t('answerModel.reload')
        ),
      ]),
      saved
        ? el('p', { key: 'saved', role: 'status' }, t('answerModel.saved'))
        : null,
      error
        ? el(
            'p',
            { key: 'error', role: 'alert', 'data-answer-model-error': error },
            t(
              error === 'answer-model-changed'
                ? 'answerModel.changed'
                : 'answerModel.error',
              { code: error }
            )
          )
        : null,
    ]
  );
};

export const FormModelSettings = ({ api, busy, setBusy, onChanged }) =>
  api.answerModel
    ? el(AnswerModelSettings, {
        api,
        busy,
        onChanged,
        run: async (work) => {
          setBusy(true);
          try {
            await work();
          } finally {
            setBusy(false);
          }
        },
      })
    : null;
