import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { useFeedbackRead } from './feedback-read.js';
import {
  chosenStickers,
  restoreCollectionStickers,
} from './collection-model.js';
import { categoryEmoji } from '../greetings/collections.js';
const el = React.createElement;

export const SavedStickerCollections = ({ api, onSend, Grid }) => {
  const t = useT();
  const enabled = typeof api.stickerCollections === 'function';
  const { data } = useFeedbackRead(
    () => api.stickerCollections(),
    'chat-collections',
    enabled
  );
  const [id, setId] = useState('');
  const [ready, setReady] = useState(null);
  const [failed, setFailed] = useState(false);
  const collections = (data?.collections ?? []).filter(
    (row) => row.source === 'telegram'
  );
  const current = collections.find((row) => row.id === id);
  useEffect(() => {
    if (!current) {
      return undefined;
    }
    let live = true;
    setReady(null);
    setFailed(false);
    (async () => {
      const panel = await api.telegramStickers({});
      if (!panel?.ok) {
        throw new Error('catalogue unavailable');
      }
      const restored = await restoreCollectionStickers(api, current);
      const emoji = categoryEmoji[current.category];
      const search =
        current.automatic && emoji
          ? await api.telegramStickerSearch({ q: emoji })
          : null;
      const pool = [
        ...panel.faved,
        ...panel.recent,
        ...restored,
        ...(search?.stickers ?? []),
      ].map((item) => ({ ...item, network: 'telegram' }));
      const available = new Set(pool.map((item) => item.id));
      if (live) {
        setReady(
          chosenStickers(current, pool).filter((item) => available.has(item.id))
        );
      }
    })().catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [api, current?.id]);
  if (!collections.length) {
    return null;
  }
  return el('div', { className: 'col chat-sticker-collections' }, [
    el('div', { key: 'controls', className: 'row' }, [
      el(
        'select',
        {
          key: 'select',
          value: id,
          'aria-label': t('collections.collection'),
          onChange: (event) => setId(event.target.value),
        },
        [
          el('option', { key: '', value: '' }, t('collections.collection')),
          ...collections.map((row) =>
            el(
              'option',
              { key: row.id, value: row.id },
              row.name || t(`collections.category.${row.category}`)
            )
          ),
        ]
      ),
      el('a', { key: 'manage', href: '#/greetings' }, t('collections.manage')),
    ]),
    current
      ? el(
          'div',
          { key: 'items', className: 'collection-picker-items' },
          failed
            ? el(
                'p',
                { role: 'status', className: 'meta' },
                t('collections.failed')
              )
            : ready
              ? ready.length
                ? el(Grid, { api, list: ready, onSend })
                : el('p', { className: 'meta' }, t('collections.empty'))
              : el(
                  'p',
                  { role: 'status', className: 'meta' },
                  t('collections.loading')
                )
        )
      : null,
  ]);
};
