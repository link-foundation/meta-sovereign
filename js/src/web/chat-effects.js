/**
 * Message effects in private chats, as Telegram Desktop and the mobile
 * apps have them (R-Y149; learned, never copied):
 * - A message sent with an effect shows its emoji by the time. When it
 *   first appears (a new message from the other side), or when the badge
 *   is clicked, the emoji bursts up over the page for a moment. Telegram's
 *   animation documents are not played: the emoji itself flies. With
 *   `prefers-reduced-motion` nothing flies.
 * - Send, right-clicked or long pressed, offers "Send with effect": a
 *   small panel of the effects Telegram has (./dom.js `telegramEffects`);
 *   a Premium-only one is locked unless the account has Premium. Picking
 *   one sends the box's text with it.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';

const el = React.createElement;

const FRESH_MS = 5 * 60_000;
const BURST_MS = 1600;
const BURST_COUNT = 14;
const FALLBACK = '✨';

// ---- The list of effects, asked once ------------------------------------

let cache = null; // { effects, premium }
let asking = null;
const listeners = new Set();

/** Forget the list (tests). */
export const resetEffects = () => {
  cache = null;
  asking = null;
};

/** The list, from the server once; `null` when it could not be had. */
export const loadEffects = (api) => {
  if (cache) {
    return Promise.resolve(cache);
  }
  if (typeof api?.telegramEffects !== 'function') {
    return Promise.resolve(null);
  }
  asking ??= api
    .telegramEffects()
    .then((answer) => {
      if (answer?.ok && Array.isArray(answer.effects)) {
        cache = { effects: answer.effects, premium: Boolean(answer.premium) };
        listeners.forEach((fn) => fn(cache));
      }
      return cache;
    })
    .catch(() => null)
    .finally(() => {
      asking = null;
    });
  return asking;
};

/** The list as it is known (loaded when `wanted`), else null. */
export const useEffectList = (api, wanted = true) => {
  const [list, setList] = useState(cache);
  useEffect(() => {
    if (!wanted) {
      return undefined;
    }
    listeners.add(setList);
    loadEffects(api).then((got) => got && setList(got));
    return () => listeners.delete(setList);
  }, [api, wanted]);
  return list;
};

/** The emoji of effect `id` in `list`, or null. */
export const emojiOf = (list, id) =>
  list?.effects?.find((one) => String(one.id) === String(id))?.emoticon ?? null;

/**
 * Whether the open chat takes effects: a private chat (a person's), not
 * Saved Messages.
 */
export const canEffect = (state, api) =>
  state.current?.source === 'telegram' &&
  state.telegram?.kind === 'user' &&
  !state.info?.self &&
  state.current.kind === 'private' &&
  /^\d+$/.test(String(state.current.chat)) &&
  typeof api?.telegramEffects === 'function';

// ---- The animation --------------------------------------------------------

export const reducedMotion = () =>
  Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

/** `emoji` bursting up from `rect` (a bounding box), then gone. */
export const playBurst = (emoji, rect) => {
  const body = globalThis.document?.body;
  if (!body || reducedMotion()) {
    return null;
  }
  const layer = globalThis.document.createElement('div');
  layer.className = 'effect-burst';
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.effectBurst = emoji;
  layer.style.left = `${(rect?.left ?? 0) + (rect?.width ?? 0) / 2}px`;
  layer.style.top = `${(rect?.top ?? 0) + (rect?.height ?? 0) / 2}px`;
  for (let i = 0; i < BURST_COUNT; i += 1) {
    const piece = globalThis.document.createElement('span');
    piece.className = 'effect-piece';
    piece.textContent = emoji;
    const spread = (i / (BURST_COUNT - 1) - 0.5) * 2;
    piece.style.setProperty('--dx', `${Math.round(spread * 140)}px`);
    piece.style.setProperty('--dy', `${-(120 + ((i * 37) % 160))}px`);
    piece.style.setProperty('--delay', `${(i % 5) * 60}ms`);
    piece.style.setProperty('--size', `${1.1 + ((i * 7) % 10) / 10}rem`);
    layer.append(piece);
  }
  body.append(layer);
  globalThis.setTimeout(() => layer.remove(), BURST_MS + 400);
  return layer;
};

// ---- The badge by the time ------------------------------------------------

const played = new Set(); // message ids that burst already

/** Whether a message's burst plays by itself: new, theirs, not yet seen. */
export const autoplays = (message, now = Date.now()) => {
  const age = now - new Date(message?.timestamp).getTime();
  return (
    !message?.pending &&
    !message?.mine &&
    Number.isFinite(age) &&
    age >= 0 &&
    age < FRESH_MS &&
    !played.has(message.id)
  );
};

/** The effect's emoji by a message's time; click plays it again. */
export const EffectBadge = ({ id, message, api, mine }) => {
  const t = useT();
  const list = useEffectList(api, true);
  const node = useRef(null);
  const emoji = emojiOf(list, id) ?? FALLBACK;
  const known = emojiOf(list, id) !== null;
  const play = () => {
    playBurst(emoji, node.current?.getBoundingClientRect?.());
  };
  useEffect(() => {
    if (known && autoplays({ ...message, mine })) {
      played.add(message.id);
      play();
    }
  }, [known, message.id]);
  return el(
    'button',
    {
      ref: node,
      type: 'button',
      className: 'bubble-effect',
      'data-message-effect': id,
      title: t('chat.effects.badge'),
      'aria-label': t('chat.effects.badge'),
      onClick: (event) => {
        event.stopPropagation();
        play();
      },
    },
    emoji
  );
};

// ---- Send with effect -----------------------------------------------------

/** The panel of effects: `onPick(id)`; Premium-only ones locked. */
export const EffectPanel = ({ api, onPick, onClose }) => {
  const t = useT();
  const list = useEffectList(api, true);
  useEffect(() => {
    const key = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    globalThis.addEventListener?.('keydown', key);
    return () => globalThis.removeEventListener?.('keydown', key);
  }, [onClose]);
  return el(
    'div',
    {
      className: 'effect-panel',
      role: 'dialog',
      'aria-label': t('chat.effects.title'),
      'data-effect-panel': 'true',
    },
    [
      el('div', { key: 'h', className: 'effect-panel-title' }, [
        el('span', { key: 't' }, t('chat.effects.title')),
        el(
          'button',
          {
            key: 'x',
            type: 'button',
            className: 'effect-panel-close',
            'aria-label': t('common.cancel'),
            onClick: onClose,
          },
          '×'
        ),
      ]),
      list
        ? el(
            'div',
            { key: 'grid', className: 'effect-grid' },
            list.effects.map((one) => {
              const locked = Boolean(one.premiumRequired) && !list.premium;
              return el(
                'button',
                {
                  key: one.id,
                  type: 'button',
                  className: 'effect-choice',
                  'data-effect-id': one.id,
                  'data-locked': locked ? 'true' : undefined,
                  disabled: locked,
                  title: locked ? t('chat.effects.premium') : undefined,
                  onClick: () => onPick(one.id),
                },
                [
                  one.emoticon,
                  locked
                    ? el(Icon, { key: 'l', name: 'lock', size: 11 })
                    : null,
                ]
              );
            })
          )
        : el(
            'div',
            { key: 'wait', className: 'effect-wait', role: 'status' },
            t('chat.effects.loading')
          ),
    ]
  );
};
