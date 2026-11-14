import React, { useEffect, useRef, useState } from 'react';
import {
  CV_TRANSLATORS,
  cvTranslationOptions,
} from '../jobs/cv-translation-record.js';

const el = React.createElement;
const names = { haiku: 'Haiku', luna: 'Luna', 'formal-ai': 'Formal AI' };
const pendingKey = (slot) => `meta-sovereign:cv-translation:${slot}`;
const pendingId = (slot) => {
  try {
    return globalThis.localStorage?.getItem(pendingKey(slot)) ?? '';
  } catch {
    return '';
  }
};

export const useCvTranslation = ({ api, values, run }) => {
  const slot = values.browserSlot;
  const [comparison, setComparison] = useState(null);
  const [pending, setPending] = useState(() => pendingId(slot));
  const [loadError, setLoadError] = useState(false);
  const generation = useRef(0);
  const load = async (id, current) => {
    const answer = await api.vacancyCvTranslationStatus({
      browserSlot: slot,
      ...(id ? { requestId: id } : {}),
    });
    if (current === generation.current) {
      setComparison(answer.comparison);
      setLoadError(false);
      if (
        answer.cancelled ||
        (answer.comparison && answer.comparison.state !== 'running')
      ) {
        globalThis.localStorage?.removeItem(pendingKey(slot));
        setPending('');
      }
    }
    return answer;
  };
  useEffect(() => {
    const current = ++generation.current;
    const id = pendingId(slot);
    setPending(id);
    setComparison(null);
    void load(id, current).catch(() => {
      if (current === generation.current) {
        setLoadError(true);
      }
    });
    return () => {
      generation.current++;
    };
  }, [api, slot]);
  return {
    comparison,
    pending,
    loadError,
    generate: (input) =>
      run('cv-translate', async () => {
        if (pending) {
          throw new Error('jobs-cv-translation-pending');
        }
        const current = generation.current;
        const requestId = globalThis.crypto.randomUUID();
        const options = cvTranslationOptions({
          ...input,
          browserSlot: slot,
          requestId,
        });
        // Only the request ID is stored in the browser; private text stays in memory.
        globalThis.localStorage.setItem(pendingKey(slot), requestId);
        setPending(requestId);
        const answer = await api.vacancyCvTranslate(options);
        if (current === generation.current) {
          setComparison(answer.comparison);
          if (answer.cancelled || answer.comparison.state !== 'running') {
            globalThis.localStorage.removeItem(pendingKey(slot));
            setPending('');
          }
        }
        return answer;
      }),
    reload: () =>
      run('cv-translation-status', () => load(pending, generation.current)),
    stop: () =>
      run('cancel', async () => {
        const answer = await api.vacancyCancel();
        await load(pending, generation.current);
        return answer;
      }),
    cancelPending: () =>
      run('cv-translation-cancel', async () => {
        await api.vacancyCvTranslationCancel({
          browserSlot: slot,
          requestId: pending,
        });
        return load(pending, generation.current);
      }),
  };
};

const Comparison = ({ comparison, t }) =>
  comparison
    ? el(
        'div',
        {
          className: 'col',
          'data-cv-translation-result': comparison.state,
          'data-cv-translation-request': comparison.input.requestId,
        },
        [
          el(
            'p',
            { key: 'state', role: 'status' },
            t(`cvTranslation.${comparison.state}`)
          ),
          el(
            'p',
            { key: 'review', className: 'meta' },
            t('cvTranslation.review')
          ),
          ...comparison.rows.map((row, index) =>
            el(
              'article',
              {
                key: index,
                className: 'col',
                'data-cv-translation-row': index,
              },
              [
                el('h4', { key: 'source-title' }, t('cvTranslation.source')),
                el(
                  'p',
                  {
                    key: 'source',
                    style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
                  },
                  row.source
                ),
                ...row.variants.map((variant) =>
                  el(
                    'div',
                    {
                      key: variant.provider,
                      className: 'col',
                      'data-cv-translation-variant': variant.provider,
                    },
                    [
                      el(
                        'strong',
                        { key: 'provider' },
                        `${names[variant.provider]} · ${variant.model ?? '—'}`
                      ),
                      el(
                        'span',
                        { key: 'cache', className: 'meta' },
                        t(
                          variant.output === null
                            ? 'cvTranslation.noAnswer'
                            : variant.cached
                              ? 'cvTranslation.cached'
                              : 'cvTranslation.fresh'
                        )
                      ),
                      el(
                        'p',
                        {
                          key: 'text',
                          style: {
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                          },
                        },
                        variant.text ??
                          `${t('cvTranslation.refused')} (${variant.reason})`
                      ),
                      variant.output && !variant.text
                        ? el('details', { key: 'output' }, [
                            el(
                              'summary',
                              { key: 'label' },
                              t('cvTranslation.output')
                            ),
                            el(
                              'p',
                              {
                                key: 'raw',
                                style: {
                                  whiteSpace: 'pre-wrap',
                                  overflowWrap: 'anywhere',
                                },
                              },
                              variant.output
                            ),
                          ])
                        : null,
                    ]
                  )
                ),
                el(
                  'p',
                  { key: 'choice', className: 'meta' },
                  row.chosenBy
                    ? `${t('cvTranslation.preferred')}: ${names[row.chosenBy]}`
                    : t('cvTranslation.none')
                ),
              ]
            )
          ),
        ]
      )
    : null;

const TranslationInput = ({ state, t }) => {
  const [text, setText] = useState('');
  const [from, setFrom] = useState('ru');
  const [providers, setProviders] = useState(CV_TRANSLATORS);
  const [models, setModels] = useState({ haiku: '', luna: '' });
  const translation = state.cvTranslation;
  const idle = !state.busy;
  const input = () => ({
    texts: [text],
    from,
    to: from === 'ru' ? 'en' : 'ru',
    providers,
    models: Object.fromEntries(
      Object.entries(models).filter(([, value]) => value)
    ),
  });
  return el(
    'fieldset',
    {
      key: 'input',
      disabled: !idle || Boolean(translation.pending),
      className: 'automation-fieldset',
    },
    [
      el('legend', { key: 'legend' }, t('cvTranslation.source')),
      el('label', { key: 'direction', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('cvTranslation.direction')),
        el(
          'select',
          {
            key: 'select',
            value: from,
            'data-cv-translation-direction': true,
            onChange: (event) => setFrom(event.target.value),
          },
          ['ru', 'en'].map((value) =>
            el(
              'option',
              { key: value, value },
              value === 'ru' ? 'RU → EN' : 'EN → RU'
            )
          )
        ),
      ]),
      el('label', { key: 'text', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('cvTranslation.text')),
        el('textarea', {
          key: 'input',
          value: text,
          rows: 5,
          maxLength: 12000,
          'data-cv-translation-text': true,
          onChange: (event) => setText(event.target.value),
        }),
      ]),
      ...CV_TRANSLATORS.map((provider) =>
        el('label', { key: provider, className: 'check' }, [
          el('input', {
            key: 'input',
            type: 'checkbox',
            checked: providers.includes(provider),
            'data-cv-translation-provider': provider,
            onChange: (event) =>
              setProviders((old) =>
                CV_TRANSLATORS.filter((name) =>
                  name === provider ? event.target.checked : old.includes(name)
                )
              ),
          }),
          names[provider],
        ])
      ),
      ...['haiku', 'luna'].map((provider) =>
        el(
          'label',
          { key: `${provider}-model`, className: 'chat-form-field' },
          [
            el(
              'span',
              { key: 'label' },
              `${names[provider]} · ${t('cvTranslation.model')}`
            ),
            el('input', {
              key: 'input',
              value: models[provider],
              maxLength: 120,
              'data-cv-translation-model': provider,
              onChange: (event) =>
                setModels((old) => ({
                  ...old,
                  [provider]: event.target.value,
                })),
            }),
          ]
        )
      ),
      el(
        'button',
        {
          key: 'generate',
          type: 'button',
          'data-cv-translation-action': 'generate',
          disabled:
            !idle ||
            !text.trim() ||
            !providers.length ||
            state.capabilities?.cvTranslation !== true ||
            Boolean(translation.pending),
          onClick: () => translation.generate(input()),
        },
        t('cvTranslation.compare')
      ),
    ]
  );
};

export const CvTranslationPanel = ({ state, t }) => {
  const translation = state.cvTranslation;
  const idle = !state.busy;
  return el('section', { className: 'col', 'data-cv-translation': true }, [
    el('h3', { key: 'title' }, t('cvTranslation.title')),
    el('p', { key: 'hint', className: 'meta' }, t('cvTranslation.hint')),
    el(TranslationInput, { key: 'input', state, t }),
    el(
      'button',
      {
        key: 'reload',
        type: 'button',
        'data-cv-translation-action': 'reload',
        disabled: !idle,
        onClick: translation.reload,
      },
      t('cvTranslation.reload')
    ),
    el(
      'button',
      {
        key: 'stop',
        type: 'button',
        'data-cv-translation-action': 'stop',
        disabled: state.busy !== 'cv-translate',
        onClick: translation.stop,
      },
      t('cvTranslation.stop')
    ),
    translation.pending
      ? el('p', { key: 'pending', role: 'status' }, t('cvTranslation.pending'))
      : null,
    translation.pending
      ? el(
          'button',
          {
            key: 'cancel',
            type: 'button',
            'data-cv-translation-action': 'cancel',
            disabled: !idle,
            onClick: translation.cancelPending,
          },
          t('cvTranslation.cancel')
        )
      : null,
    translation.loadError
      ? el('p', { key: 'error', role: 'alert' }, t('cvTranslation.loadError'))
      : null,
    el(Comparison, {
      key: 'comparison',
      comparison: translation.comparison,
      t,
    }),
  ]);
};
