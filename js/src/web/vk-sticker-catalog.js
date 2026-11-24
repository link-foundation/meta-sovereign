import React, { useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useT } from './i18n.js';
const el = React.createElement;
const INITIAL = {
  accountId: '',
  q: '',
  packId: '',
  category: 'all',
  usableOnly: true,
  folder: '',
  received: '',
};
const wrap = { flexWrap: 'wrap', gap: 'var(--gap, 12px)' };

const CatalogEvidence = ({ answer, choose, t }) => {
  if (!answer?.catalog) {
    return null;
  }
  const { catalog } = answer;
  return el('div', { className: 'col', 'data-sticker-catalog-evidence': '' }, [
    el(
      'p',
      { key: 'count' },
      t('vkStickers.count', {
        packs: catalog.packs,
        stickers: catalog.stickers,
        usable: catalog.usable,
        keywords: catalog.keywords,
      })
    ),
    el(
      'p',
      { key: 'time' },
      `${t('vkStickers.snapshot')} ${new Date(catalog.updatedAt).toISOString()}`
    ),
    el(
      'p',
      {
        key: 'greeting',
        style: { overflowWrap: 'anywhere' },
        'data-usable-greeting-ids': '',
      },
      t('vkStickers.greetingIds', {
        ids: catalog.greetingIds.join(', ') || '—',
      })
    ),
    el(
      'p',
      { key: 'matched' },
      t('vkStickers.matched', { count: answer.matched, offset: answer.offset })
    ),
    el(
      'div',
      { key: 'grid', className: 'collections-grid' },
      answer.items.map((item) =>
        el(
          'div',
          {
            key: item.id,
            className: 'col',
            'data-catalog-sticker': item.id,
            'data-usable': item.usable,
          },
          [
            el('img', {
              key: 'preview',
              src: `https://vk.com/sticker/1-${item.id}-512`,
              width: 96,
              height: 96,
              loading: 'lazy',
              alt: `${item.pack} · ${item.id}`,
            }),
            el(
              'span',
              { key: 'pack', style: { overflowWrap: 'anywhere' } },
              `${item.pack} · ${item.id}`
            ),
            el(
              'span',
              { key: 'state', className: 'meta' },
              t(item.usable ? 'vkStickers.usable' : 'vkStickers.unavailable')
            ),
            choose
              ? el(
                  'button',
                  {
                    key: 'choose',
                    type: 'button',
                    disabled: !item.usable,
                    'data-catalog-choose': item.id,
                    onClick: () => choose(item),
                  },
                  t('vkStickers.choose')
                )
              : null,
          ]
        )
      )
    ),
  ]);
};

const useCatalogControls = (api) => {
  const t = useT();
  const [form, setForm] = useState(INITIAL);
  const [answer, setAnswer] = useState(null);
  const [filtered, setFiltered] = useState(null);
  const [exported, setExported] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    if (!['folder', 'received'].includes(key)) {
      setAnswer(null);
    }
    if (key === 'received') {
      setFiltered(null);
    }
    setExported(null);
    setError('');
  };
  const act = async (name, extra = {}) => {
    setBusy(true);
    setError('');
    try {
      const input = {
        ...form,
        ...extra,
        ...(['filter', 'export'].includes(name) && form.received.trim()
          ? { attachments: JSON.parse(form.received) }
          : {}),
      };
      const result = await api[`${name}VkStickers`](input);
      if (!result?.ok) {
        throw Object.assign(new Error('Sticker catalog action refused'), {
          code: result?.code,
        });
      }
      if (name === 'filter') {
        setFiltered(result);
      } else if (name === 'export') {
        setExported(result);
      } else {
        setAnswer(result);
      }
    } catch (failure) {
      setError(
        t(
          failure.code === 'server-required'
            ? 'vkStickers.server-required'
            : 'vkStickers.failed'
        )
      );
    } finally {
      setBusy(false);
    }
  };
  const field = (key, type = 'text') =>
    el('label', { key, className: 'col' }, [
      el('span', { key: 'label' }, t(`vkStickers.${key}`)),
      el('input', {
        key: 'input',
        type,
        value: form[key],
        disabled: busy,
        'data-sticker-field': key,
        onChange: (event) => set(key, event.target.value),
      }),
    ]);
  const button = (key, action = key, extra = {}, disabled = false) =>
    el(
      'button',
      {
        key,
        type: 'button',
        disabled: busy || disabled,
        'data-sticker-action': key,
        onClick: () => act(action, extra),
      },
      t(`vkStickers.${key}`)
    );
  return {
    t,
    form,
    answer,
    filtered,
    exported,
    busy,
    error,
    set,
    field,
    button,
  };
};

const CatalogReceived = ({ form, busy, set, button, filtered, t }) =>
  el('details', { key: 'received' }, [
    el('summary', { key: 'label' }, t('vkStickers.received')),
    el('p', { key: 'hint', className: 'meta' }, t('vkStickers.receivedHint')),
    el('textarea', {
      key: 'input',
      rows: 4,
      maxLength: 1048576,
      value: form.received,
      disabled: busy,
      'aria-label': t('vkStickers.received'),
      'data-sticker-field': 'received',
      onChange: (event) => set('received', event.target.value),
    }),
    button('filter', 'filter', {}, !form.received.trim()),
    filtered
      ? el(
          'p',
          { key: 'result', 'data-filtered-products': '' },
          t('vkStickers.filtered', {
            count: filtered.stickers.length,
            ids: filtered.products.join(', ') || '—',
          })
        )
      : null,
  ]);

export const VkStickerCatalog = ({ api = defaultApi, onChoose } = {}) => {
  const {
    t,
    form,
    answer,
    filtered,
    exported,
    busy,
    error,
    set,
    field,
    button,
  } = useCatalogControls(api);
  return el(
    'section',
    { className: 'col', 'data-vk-stickers': '', 'aria-busy': busy },
    [
      el('h3', { key: 'title' }, t('vkStickers.title')),
      el('p', { key: 'hint', className: 'meta' }, t('vkStickers.hint')),
      el('div', { key: 'fields', className: 'row', style: wrap }, [
        field('accountId'),
        field('q'),
        field('packId'),
        el('label', { key: 'category', className: 'col' }, [
          el('span', { key: 'label' }, t('collections.category')),
          el(
            'select',
            {
              key: 'input',
              value: form.category,
              disabled: busy,
              'data-sticker-field': 'category',
              onChange: (event) => set('category', event.target.value),
            },
            ['all', 'greeting', 'birthday', 'thanks', 'farewell', 'custom'].map(
              (value) =>
                el(
                  'option',
                  { key: value, value },
                  t(
                    value === 'all'
                      ? 'vkStickers.all'
                      : `collections.category.${value}`
                  )
                )
            )
          ),
        ]),
      ]),
      el('label', { key: 'usable', className: 'row' }, [
        el('input', {
          key: 'input',
          type: 'checkbox',
          checked: form.usableOnly,
          disabled: busy,
          'data-sticker-field': 'usableOnly',
          onChange: (event) => set('usableOnly', event.target.checked),
        }),
        t('vkStickers.usableOnly'),
      ]),
      el('div', { key: 'actions', className: 'row', style: wrap }, [
        button('inspect'),
        button('refresh'),
      ]),
      error ? el('p', { key: 'error', role: 'alert' }, error) : null,
      busy
        ? el('p', { key: 'busy', role: 'status' }, t('vkStickers.working'))
        : null,
      answer && !answer.catalog
        ? el(
            'p',
            { key: 'empty', 'data-catalog-empty': '' },
            t('vkStickers.empty')
          )
        : null,
      el(CatalogEvidence, {
        key: 'evidence',
        answer,
        choose: busy ? null : onChoose,
        t,
      }),
      el('div', { key: 'pages', className: 'row', style: wrap }, [
        button('first', 'inspect', { offset: 0 }, !answer?.offset),
        button(
          'next',
          'inspect',
          { offset: answer?.next },
          answer?.next === null || !answer
        ),
      ]),
      el(CatalogReceived, {
        key: 'received',
        form,
        busy,
        set,
        button,
        filtered,
        t,
      }),
      field('folder'),
      el(
        'p',
        { key: 'exportHint', className: 'meta' },
        t('vkStickers.exportHint')
      ),
      button('export', 'export', {}, !form.folder),
      exported
        ? el(
            'p',
            {
              key: 'exported',
              role: 'status',
              'data-catalog-exported': '',
              style: { overflowWrap: 'anywhere' },
            },
            t('vkStickers.exported', { folder: exported.folder })
          )
        : null,
    ]
  );
};
