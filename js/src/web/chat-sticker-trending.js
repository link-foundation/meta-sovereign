// Trending stickers and emoji, as Telegram Desktop's panel offers them
// (R-Y206; learned, never copied). A "Trending" button by the Stickers
// tab's search box lists the trending sticker sets (messages.getFeaturedStickers),
// each with its stickers and an Add button, the new ones marked; "Show more"
// asks older ones (getOldFeaturedStickers). The sets shown are read
// (readFeaturedStickers) so they lose their mark. The emoji panel's
// "Trending emoji" lists the trending custom emoji sets the same way, a row
// each (their emoji are not sent as stickers) with an Add button.

import React, { useCallback, useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { AddSet, Note, SetSection, SetThumb } from './chat-stickers.js';

const el = React.createElement;

// The trending sets of one kind, a page more on request.
const useFeatured = (api, emojis) => {
  const [state, setState] = useState({
    phase: 'loading',
    sets: [],
    unread: [],
    more: !emojis,
    offset: 0,
  });
  useEffect(() => {
    let live = true;
    Promise.resolve(api.telegramStickerFeatured({ emojis }))
      .then((answer) => {
        if (!live) {
          return;
        }
        setState((old) =>
          answer?.ok
            ? {
                ...old,
                phase: 'ready',
                sets: answer.sets,
                unread: answer.unread ?? [],
              }
            : { ...old, phase: 'error' }
        );
      })
      .catch(() => live && setState((old) => ({ ...old, phase: 'error' })));
    return () => {
      live = false;
    };
  }, [api, emojis]);
  const more = useCallback(async () => {
    const answer = await Promise.resolve(
      api.telegramStickerFeatured({ old: true, offset: state.offset })
    ).catch(() => null);
    setState((old) => {
      if (!answer?.ok) {
        return { ...old, more: false };
      }
      const seen = new Set(old.sets.map((s) => s.id));
      return {
        ...old,
        sets: [...old.sets, ...answer.sets.filter((s) => !seen.has(s.id))],
        more: answer.next !== null,
        offset: answer.next ?? old.offset,
      };
    });
  }, [api, state.offset]);
  return { state, more };
};

// The new sets are read once they are on screen.
const useReadOnView = (api, unread) => {
  const key = unread.join(',');
  useEffect(() => {
    if (
      unread.length > 0 &&
      typeof api.telegramStickerFeaturedRead === 'function'
    ) {
      Promise.resolve(api.telegramStickerFeaturedRead({ ids: unread })).catch(
        () => {}
      );
    }
  }, [api, key]);
};

const EmojiSetRow = ({ api, set, onAdd, mark }) =>
  el('div', { className: 'trending-emoji-set', 'data-trending-set': set.id }, [
    el(
      'span',
      { key: 'c', className: 'sticker-setting-cover' },
      el(SetThumb, { api, set })
    ),
    el('span', { key: 'n', className: 'sticker-setting-name' }, [
      el('strong', { key: 't' }, [
        set.title,
        mark ? el('span', { key: 'm', className: 'sticker-new' }, mark) : null,
      ]),
      el('span', { key: 'k', className: 'meta' }, String(set.count)),
    ]),
    set.installed === false ? el(AddSet, { key: 'a', set, onAdd }) : null,
  ]);

/**
 * The trending list: `emojis` the custom emoji sets (a row each), else
 * the sticker sets with their stickers; `onBack` returns to the panel.
 */
export const FeaturedSets = ({
  api,
  emojis = false,
  onSend,
  onMenu,
  onAdd,
  onBack,
}) => {
  const t = useT();
  const { state, more } = useFeatured(api, emojis);
  useReadOnView(api, state.unread);
  const fresh = new Set(state.unread);
  let body;
  if (state.phase === 'loading') {
    body = el(Note, { text: t('chat.stickers.loading') });
  } else if (state.phase === 'error') {
    body = el(Note, { text: t('chat.stickers.failed') });
  } else if (state.sets.length === 0) {
    body = el(Note, { text: t('chat.extras.noTrending') });
  } else {
    body = state.sets.map((set) =>
      emojis
        ? el(EmojiSetRow, {
            key: set.id,
            api,
            set,
            onAdd,
            mark: fresh.has(set.id) ? t('chat.extras.new') : null,
          })
        : el(SetSection, {
            key: set.id,
            api,
            set,
            onSend,
            onMenu,
            onAdd,
            mark: fresh.has(set.id) ? t('chat.extras.new') : null,
          })
    );
  }
  return el(
    'div',
    {
      className: 'trending-sets',
      'data-trending': emojis ? 'emoji' : 'stickers',
    },
    [
      el('div', { key: 'h', className: 'trending-head' }, [
        el(
          'button',
          {
            key: 'b',
            type: 'button',
            className: 'trending-back',
            'data-action': 'trending-back',
            onClick: onBack,
          },
          t('chat.extras.back')
        ),
        el(
          'strong',
          { key: 't' },
          t(emojis ? 'chat.extras.trendingEmoji' : 'chat.extras.trendingTitle')
        ),
      ]),
      el('div', { key: 's', className: 'emoji-scroll' }, [
        el(React.Fragment, { key: 'body' }, body),
        state.phase === 'ready' && state.more
          ? el(
              'button',
              {
                key: 'more',
                type: 'button',
                className: 'trending-more',
                'data-action': 'trending-more',
                onClick: more,
              },
              t('chat.extras.more')
            )
          : null,
      ]),
    ]
  );
};
