// Searching custom emoji by words in the emoji status picker (R-Y206;
// learned, never copied), for a Premium account as in Telegram Desktop:
// an emoji or a word in the box, once typing pauses, asks Telegram for the
// custom emoji that match (messages.searchCustomEmoji); a click on one
// sets it as the status, for the duration chosen above.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { CustomEmoji } from './custom-emoji.js';

const el = React.createElement;

const PAUSE_MS = 350;

// What is typed, once typing pauses.
const useSettled = (value) => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => setSettled(value), PAUSE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [value]);
  return settled;
};

// The ids found for `q`; null while asking, `[]` when none or it failed.
const useFound = (api, q) => {
  const [found, setFound] = useState({ q: '', ids: [] });
  useEffect(() => {
    if (!q) {
      return undefined;
    }
    let live = true;
    Promise.resolve(api.telegramCustomEmojiSearch({ q }))
      .then(
        (answer) => live && setFound({ q, ids: answer?.ok ? answer.ids : [] })
      )
      .catch(() => live && setFound({ q, ids: [] }));
    return () => {
      live = false;
    };
  }, [api, q]);
  return q && found.q === q ? found.ids : null;
};

/** The search box and what it finds; `onPick(id)` sets one as the status. */
export const EmojiStatusSearch = ({ api, onPick }) => {
  const t = useT();
  const [query, setQuery] = useState('');
  const q = useSettled(query.trim());
  const ids = useFound(api, q);
  if (typeof api?.telegramCustomEmojiSearch !== 'function') {
    return null;
  }
  let body = null;
  if (query.trim() && ids === null) {
    body = el('p', { className: 'meta' }, t('chat.stickers.loading'));
  } else if (ids && ids.length === 0) {
    body = el('p', { className: 'meta' }, t('chat.extras.customNone'));
  } else if (ids && query.trim()) {
    body = el(
      'div',
      { className: 'emoji-status-grid', 'data-grid': 'found' },
      ids.map((id) =>
        el(
          'button',
          {
            key: id,
            type: 'button',
            className: 'emoji-status-pick',
            'data-emoji-status-pick': id,
            onClick: () => onPick(id),
          },
          el(CustomEmoji, { id, text: '⭐', api })
        )
      )
    );
  }
  return el('div', { className: 'emoji-status-search' }, [
    el('input', {
      key: 'q',
      type: 'search',
      className: 'emoji-search',
      placeholder: t('chat.extras.customSearch'),
      'aria-label': t('chat.extras.customSearch'),
      'data-field': 'custom-emoji-search',
      value: query,
      onChange: (event) => setQuery(event.target.value),
    }),
    body,
  ]);
};
