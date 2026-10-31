import React, { useState } from 'react';
import { useT } from './i18n.js';
import { useFeedbackRead } from './feedback-read.js';
import { openFeedbackMessage } from './feedback-navigation.js';
import { PageLoading } from './spinner.js';

const el = React.createElement;
export const HistoryLibrary = ({ api, kind }) => {
  const t = useT();
  const [threshold, setThreshold] = useState(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const { data, loading, refresh } = useFeedbackRead(
    () => api.historyLibrary(),
    'history-library'
  );
  if (loading) {
    return el(PageLoading);
  }
  const items =
    kind === 'facts'
      ? data.facts
      : kind === 'patterns'
        ? data.patterns
        : data.groups;
  const save = async () => {
    setSaving(true);
    setFailed(false);
    try {
      const result = await api.saveLibraryThreshold(
        Number(threshold ?? data.threshold)
      );
      if (!result?.ok) {
        throw new Error('save failed');
      }
      await refresh();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  return el(
    'section',
    { className: 'col history-library', 'data-history-library': kind },
    [
      el('h3', { key: 'h' }, t(`library.${kind}`)),
      el('p', { key: 'coverage', className: 'meta' }, t('library.coverage')),
      el(
        'p',
        { key: 'input', className: 'meta' },
        t('library.input', {
          eligible: data.eligible,
          total: data.considered,
          threshold: data.threshold,
        })
      ),
      el('div', { key: 'threshold', className: 'row' }, [
        el('label', { key: 'label' }, [
          t('library.threshold'),
          el('input', {
            key: 'n',
            type: 'number',
            min: 1,
            max: 100,
            value: threshold ?? data.threshold,
            'data-action': 'library-threshold',
            onChange: (event) => setThreshold(event.target.value),
          }),
        ]),
        el(
          'button',
          { key: 'save', type: 'button', disabled: saving, onClick: save },
          t('common.save')
        ),
        failed
          ? el(
              'span',
              { key: 'error', role: 'status' },
              t('feedback.settings.failed')
            )
          : null,
      ]),
      el(
        'p',
        { key: 'words', className: 'meta', 'data-library-words': '' },
        data.words
          .slice(0, 20)
          .map((row) => `${row.word} (${row.count})`)
          .join(' · ')
      ),
      items.length
        ? null
        : el('p', { key: 'empty', className: 'meta' }, t('library.empty')),
      ...items.map((item, n) =>
        el('article', { key: n, className: 'card' }, [
          el(
            'strong',
            { key: 'count' },
            kind === 'facts'
              ? item.by
              : t('library.count', { count: item.count })
          ),
          item.prompt
            ? el(
                'p',
                { key: 'prompt', className: 'feedback-text' },
                item.prompt
              )
            : null,
          ...(kind === 'facts'
            ? [{ text: item.question }, { text: item.answer }]
            : (item.variations ?? item.examples.map((text) => ({ text })))
          ).map((row, i) =>
            el(
              'p',
              { key: `v${i}`, className: 'feedback-text' },
              `${row.text}${row.count ? ` · ${row.count}` : ''}`
            )
          ),
          item.regex
            ? el(
                'code',
                { key: 'regex', className: 'feedback-text' },
                item.regex
              )
            : null,
          kind === 'facts'
            ? el(
                'button',
                {
                  key: 'evidence',
                  type: 'button',
                  onClick: () =>
                    openFeedbackMessage({
                      source: item.source,
                      chat: item.chat,
                      id: item.evidence[0],
                    }),
                },
                t('feedback.viewMessage')
              )
            : null,
        ])
      ),
    ]
  );
};
