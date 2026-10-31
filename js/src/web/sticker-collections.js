import React from 'react';
import { useT } from './i18n.js';
import { Picture } from './chat-stickers.js';
import {
  collectionCategories,
  stickerIdentity,
  stickerSources,
} from '../greetings/collections.js';
import { activeAccount } from './telegram-account-scope.js';
import { useCollectionState } from './sticker-collection-state.js';
const el = React.createElement;
const field = (key, title, value, options, change) =>
  el('label', { key, className: 'col' }, [
    el('span', { key: 'label', className: 'meta' }, title),
    el(
      'select',
      {
        key: 'select',
        value,
        onChange: (e) => change(e.target.value),
        'data-collection-field': key,
      },
      options.map(([id, label]) => el('option', { key: id, value: id }, label))
    ),
  ]);
const tile = ({ api, item, selected, onClick }) =>
  el(
    'button',
    {
      key: stickerIdentity(item),
      type: 'button',
      className: `collection-sticker${selected ? ' selected' : ''}`,
      'aria-pressed': selected,
      'aria-label': [item.network, item.emoji, item.pack, item.id]
        .filter(Boolean)
        .join(' · '),
      'data-collection-sticker': stickerIdentity(item),
      onClick,
    },
    [
      item.network === 'telegram'
        ? el(Picture, { key: 'image', api, item })
        : item.previewUrl
          ? el('img', {
              key: 'image',
              src: item.previewUrl,
              width: 96,
              height: 96,
              loading: 'lazy',
              alt: item.emoji,
            })
          : el(
              'span',
              { key: 'emoji', className: 'greetings-emoji' },
              item.emoji || '◇'
            ),
      el('span', { key: 'selected', className: 'meta' }, selected ? '✓' : '+'),
    ]
  );

const CollectionActions = ({ state: s }) => {
  const t = useT();
  const status = ['busy', 'error', 'saved', 'dirty'].find((flag) => s[flag]);
  const labels = {
    busy: 'collections.loading',
    error: 'collections.failed',
    saved: 'greetings.saved',
    dirty: 'collections.unsaved',
  };
  return el('div', { className: 'row' }, [
    el(
      'button',
      {
        key: 'add',
        type: 'button',
        disabled: !s.collections || s.busy || s.collections.length >= 40,
        'data-action': 'collection-add',
        onClick: s.add,
      },
      t('collections.add')
    ),
    el(
      'button',
      {
        key: 'save',
        type: 'button',
        disabled: !s.collections || s.busy,
        'data-action': 'collections-save',
        onClick: s.save,
      },
      t('common.save')
    ),
    el(
      'span',
      { key: 'status', className: 'meta', role: 'status' },
      status ? t(labels[status]) : ''
    ),
  ]);
};
const CollectionFields = ({ state: s }) => {
  const t = useT();
  const name = (row) =>
    row.name || `${row.source} · ${t(`collections.category.${row.category}`)}`;
  return el(React.Fragment, null, [
    field(
      'collection',
      t('collections.collection'),
      s.current.id,
      s.collections.map((row) => [row.id, name(row)]),
      s.setSelected
    ),
    el('div', { key: 'fields', className: 'row collections-fields' }, [
      field(
        'source',
        t('greetings.network'),
        s.current.source,
        stickerSources.map((source) => [source, source]),
        (source) => s.patch({ source, stickers: [] })
      ),
      field(
        'category',
        t('collections.category'),
        s.current.category,
        collectionCategories.map((category) => [
          category,
          t(`collections.category.${category}`),
        ]),
        (category) => s.patch({ category })
      ),
      el('label', { key: 'name', className: 'col' }, [
        el('span', { key: 'label', className: 'meta' }, t('collections.name')),
        el('input', {
          key: 'input',
          value: s.current.name,
          maxLength: 120,
          'data-collection-field': 'name',
          onChange: (e) => s.patch({ name: e.target.value }),
        }),
      ]),
      el(
        'button',
        { key: 'delete', type: 'button', onClick: s.remove },
        t('collections.remove')
      ),
    ]),
    el('label', { key: 'automatic', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked: s.current.automatic,
        'data-collection-field': 'automatic',
        onChange: (e) => s.patch({ automatic: e.target.checked }),
      }),
      t('collections.automatic'),
    ]),
  ]);
};
const TelegramChoices = ({ state: s }) => {
  const t = useT();
  return el('div', { className: 'row' }, [
    el('input', {
      key: 'query',
      type: 'search',
      value: s.query,
      placeholder: t('collections.search'),
      'aria-label': t('collections.search'),
      onChange: (e) => s.setQuery(e.target.value),
    }),
    el(
      'button',
      { key: 'search', type: 'button', disabled: s.busy, onClick: s.lookup },
      t('collections.find')
    ),
    field(
      'set',
      t('collections.pack'),
      s.setId,
      [['', '—'], ...s.sets.map((set) => [set.id, set.title])],
      s.setSetId
    ),
    el(
      'button',
      {
        key: 'pack',
        type: 'button',
        disabled: s.busy || !s.setId,
        onClick: s.loadPack,
      },
      t('collections.loadPack')
    ),
  ]);
};
const CollectionGrid = ({ state: s }) => {
  const t = useT();
  return el(React.Fragment, null, [
    el(
      'p',
      { key: 'count', className: 'meta' },
      t('greetings.selected', {
        count: s.chosen.length,
        total: s.offered.length,
      })
    ),
    s.offered.length
      ? el(
          'div',
          { key: 'grid', className: 'collections-grid' },
          s.offered.slice(0, s.visible).map((item) =>
            tile({
              api: s.api,
              item,
              selected: s.checked.has(stickerIdentity(item)),
              onClick: () => s.toggle(item),
            })
          )
        )
      : el('p', { key: 'empty', className: 'meta' }, t('collections.empty')),
    s.offered.length > s.visible
      ? el(
          'button',
          {
            key: 'more',
            type: 'button',
            onClick: () => s.setVisible(s.visible + 80),
          },
          t('collections.more')
        )
      : null,
  ]);
};
const CollectionEditor = ({ api }) => {
  const t = useT();
  const state = useCollectionState(api);
  return el(
    'section',
    { className: 'col sticker-collections', 'data-sticker-collections': '' },
    [
      el('h2', { key: 'title' }, t('collections.title')),
      el('p', { key: 'intro', className: 'meta' }, t('collections.intro')),
      el(CollectionActions, { key: 'actions', state }),
      state.current
        ? el(React.Fragment, { key: 'editor' }, [
            el(CollectionFields, { key: 'fields', state }),
            state.current.source === 'telegram'
              ? el(TelegramChoices, { key: 'telegram', state })
              : null,
            el(CollectionGrid, { key: 'grid', state }),
          ])
        : null,
    ]
  );
};
export const StickerCollections = ({ api }) =>
  el(CollectionEditor, { key: activeAccount(), api });
