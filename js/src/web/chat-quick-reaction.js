// The quick reaction (R-Y206; learned, never copied), as Telegram Desktop's
// Settings → Chat Settings → Quick reaction: the reaction a double-click
// (a double tap on a phone) on a message sends. It is the account's own
// default (help.getConfig, changed with messages.setDefaultReaction), asked
// once per page and shared by every message; one the chat does not allow is
// not used. The settings dialog lets the user choose it among the
// reactions Telegram offers. Without a known one a double-click replies, as
// it did before.

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

let chosen = null;
let requested = false;
const listeners = new Set();

const setChosen = (emoji) => {
  if (emoji !== chosen) {
    chosen = emoji;
    listeners.forEach((listener) => listener());
  }
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Forget the reaction asked and chosen (tests). */
export const forgetQuickReaction = () => {
  requested = false;
  setChosen(null);
};

/** The reaction a double-click sends: the chosen one when `allowed`, else null. */
export const quickPick = (emoji, allowed) =>
  emoji && Array.isArray(allowed) && allowed.includes(emoji) ? emoji : null;

/**
 * The account's quick reaction (null until known), asked once a page when
 * the page can ask; it follows a change made in the settings.
 */
export const useQuickReaction = (api) => {
  const able = typeof api?.telegramQuickReaction === 'function';
  useEffect(() => {
    if (!able || requested) {
      return;
    }
    requested = true;
    // Once a page, whatever the answer: a page without the account keeps
    // replying to a double-click.
    Promise.resolve(api.telegramQuickReaction())
      .then((answer) => {
        if (answer?.ok && typeof answer.emoji === 'string') {
          setChosen(answer.emoji);
        }
      })
      .catch(() => {});
  }, [able, api]);
  return useSyncExternalStore(
    subscribe,
    () => chosen,
    () => null
  );
};

/**
 * What a message's gestures react with: `quickReaction` (a double tap) is
 * the account's, else the chat's first allowed one; `doubleClickReaction`
 * only the account's, so a double-click replies while none is known.
 */
export const useRowReactions = (api, allowed) => {
  const quick = quickPick(useQuickReaction(api), allowed);
  return { quickReaction: quick ?? allowed[0], doubleClickReaction: quick };
};

const errorText = (t, code) => {
  const key = `chat.extras.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.extras.err.failed') : text;
};

// The reactions Telegram offers that anyone may use, once.
const useOffered = (api) => {
  const [list, setList] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.resolve(api.telegramAvailableReactions?.())
      .then((answer) => {
        if (live) {
          setList(answer?.ok ? answer.reactions.filter((r) => !r.premium) : []);
        }
      })
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [api]);
  return list;
};

/** The settings' choice of the quick reaction: a row of reactions. */
export const QuickReactionPicker = ({ api, onError }) => {
  const t = useT();
  const current = useQuickReaction(api);
  const list = useOffered(api);
  const [busy, setBusy] = useState(false);
  if (
    typeof api?.telegramQuickReactionSet !== 'function' ||
    !list ||
    list.length === 0
  ) {
    return null;
  }
  const choose = async (emoji) => {
    setBusy(true);
    const answer = await Promise.resolve(
      api.telegramQuickReactionSet({ emoji })
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      onError(null);
      setChosen(emoji);
    } else {
      onError(errorText(t, answer?.code));
    }
  };
  return el(
    'div',
    { className: 'quick-reaction', 'data-section': 'quick-reaction' },
    [
      el('strong', { key: 't' }, t('chat.extras.quickReaction')),
      el('p', { key: 'h', className: 'meta' }, t('chat.extras.quickHint')),
      el(
        'div',
        { key: 'g', className: 'quick-reaction-row', role: 'group' },
        list.map((r) =>
          el(
            'button',
            {
              key: r.emoji,
              type: 'button',
              className:
                r.emoji === current
                  ? 'quick-reaction-pick is-on'
                  : 'quick-reaction-pick',
              title: r.title,
              'aria-pressed': r.emoji === current,
              'data-quick-reaction': r.emoji,
              disabled: busy,
              onClick: () => choose(r.emoji),
            },
            r.emoji
          )
        )
      ),
    ]
  );
};
