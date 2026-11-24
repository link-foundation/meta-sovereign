import React, { useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { VK_CACHE_KINDS } from '../../sources/vk-cache-shape.js';

const el = React.createElement;
const INITIAL = {
  accountId: '',
  peerId: '',
  kind: 'history',
  maxPages: 5,
  folder: '',
};
const CacheEvidence = ({ answer, act, button, t }) => {
  const cache = answer?.cache;
  return cache
    ? el(
        'div',
        {
          key: 'cache',
          className: 'col',
          'data-cache-state': cache.complete ? 'complete' : 'partial',
        },
        [
          el(
            'p',
            { key: 'coverage' },
            t('vkCache.coverage', {
              count: cache.count,
              total: cache.total,
              offset: cache.nextOffset ?? '—',
            })
          ),
          el(
            'p',
            { key: 'updated' },
            `${t(cache.stale ? 'vkCache.stale' : 'vkCache.cached')} ${new Date(cache.updatedAt).toISOString()}`
          ),
          el('details', { key: 'items' }, [
            el('summary', { key: 'label' }, t('vkCache.records')),
            el(
              'pre',
              {
                key: 'data',
                style: {
                  maxHeight: '16rem',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                },
              },
              JSON.stringify(answer.items, null, 2)
            ),
          ]),
          button(
            'first',
            () => act('inspect', { pageOffset: 0 }),
            answer.pageOffset === 0
          ),
          button(
            'next',
            () => act('inspect', { pageOffset: answer.nextPage }),
            answer.nextPage === null
          ),
        ]
      )
    : null;
};
const CacheExportReceipt = ({ answer, t }) =>
  el(React.Fragment, null, [
    answer?.folder
      ? el(
          'p',
          {
            key: 'exported',
            'data-cache-exported': '',
            role: 'status',
            style: { overflowWrap: 'anywhere' },
          },
          t('vkCache.exported', {
            count: answer.messages,
            folder: answer.folder,
          })
        )
      : null,
    answer?.coverage
      ? el(
          'p',
          { key: 'exportCoverage', 'data-cache-export-coverage': '' },
          t('vkCache.coverage', {
            count: answer.coverage.cached,
            total: answer.coverage.total,
            offset: answer.coverage.nextOffset ?? '—',
          })
        )
      : null,
  ]);
export const VkCache = () => {
  const t = useT();
  const [form, setForm] = useState(INITIAL);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setAnswer(null);
    setError('');
  };
  const act = async (name, extra = {}) => {
    setBusy(true);
    setError('');
    try {
      const result = await api[`${name}VkCache`]({
        ...form,
        ...extra,
        maxPages: Number(form.maxPages),
      });
      if (!result.ok) {
        throw Object.assign(new Error('Cache action refused'), {
          code: result.code,
        });
      }
      setAnswer(result);
    } catch (failure) {
      const key = `vkCache.${failure.code}`;
      setError(t(key) === key ? t('vkCache.failed') : t(key));
    } finally {
      setBusy(false);
    }
  };
  const field = (key, type = 'text') =>
    el('label', { key, className: 'col' }, [
      el('span', { key: 'label' }, t(`vkCache.${key}`)),
      el('input', {
        key: 'input',
        type,
        value: form[key],
        disabled: busy,
        'data-cache-field': key,
        onChange: (event) => set(key, event.target.value),
      }),
    ]);
  const button = (key, callback, disabled = false) =>
    el(
      'button',
      {
        key,
        type: 'button',
        disabled: busy || disabled,
        onClick: callback,
        'data-cache-action': key,
      },
      t(`vkCache.${key}`)
    );
  return el(
    'section',
    { className: 'col', 'data-vk-cache': '', 'aria-busy': busy },
    [
      el('h3', { key: 'title' }, t('vkCache.title')),
      el('p', { key: 'hint', className: 'meta' }, t('vkCache.hint')),
      el(
        'div',
        {
          key: 'fields',
          className: 'row',
          style: { flexWrap: 'wrap', gap: 'var(--gap, 12px)' },
        },
        [
          field('accountId'),
          field('peerId'),
          field('maxPages', 'number'),
          el('label', { key: 'kind', className: 'col' }, [
            el('span', { key: 'label' }, t('vkCache.kind')),
            el(
              'select',
              {
                key: 'select',
                value: form.kind,
                disabled: busy,
                'data-cache-field': 'kind',
                onChange: (event) => set('kind', event.target.value),
              },
              VK_CACHE_KINDS.map((kind) =>
                el('option', { key: kind, value: kind }, t(`vkCache.${kind}`))
              )
            ),
          ]),
        ]
      ),
      el(
        'div',
        {
          key: 'actions',
          className: 'row',
          style: { flexWrap: 'wrap', gap: 'var(--gap, 12px)' },
        },
        [
          button('inspect', () => act('inspect')),
          button('refresh', () => act('refresh')),
          button('restart', () => act('refresh', { restart: true })),
        ]
      ),
      error ? el('p', { key: 'error', role: 'alert' }, error) : null,
      busy
        ? el('p', { key: 'busy', role: 'status' }, t('vkCache.working'))
        : null,
      answer && !answer.cache && !answer.folder
        ? el('p', { key: 'empty', 'data-cache-empty': '' }, t('vkCache.empty'))
        : null,
      el(CacheEvidence, { key: 'evidence', answer, act, button, t }),
      field('folder'),
      el(
        'p',
        { key: 'exportHint', className: 'meta' },
        t('vkCache.exportHint')
      ),
      button(
        'export',
        () => act('export'),
        form.kind !== 'history' || !form.folder
      ),
      el(CacheExportReceipt, { key: 'exportReceipt', answer, t }),
    ]
  );
};
