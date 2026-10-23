// A message's fact check, as Telegram Desktop shows it (R-Y166; learned,
// never copied): a "Fact check" box under the text with what the checkers
// wrote (its entities too) and the country they wrote it for. Telegram
// sends only a hash with `need_check`; the text is then asked for, but
// only for a message that is on screen, the asks of one moment made as
// one, and every answer kept by chat and id.

import React, { useEffect, useRef, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { networkMessageId } from './chat-model.js';
import { MessageText } from './message-text.js';

const el = React.createElement;

const WAIT_MS = 120;
const BATCH = 100;

const kept = new Map(); // chat:id -> item | null (asked, none)
const waiting = new Map(); // chat -> { ids: Set, api }
const heard = new Set(); // listeners, told when an answer comes
let timer = null;

/** Forgets every answer and ask (the tests'). */
export const forgetFactChecks = () => {
  kept.clear();
  waiting.clear();
  globalThis.clearTimeout(timer);
  timer = null;
};

const keyOf = (chat, id) => `${chat}:${id}`;

const answer = (chat, ids, items) => {
  const found = new Map((items ?? []).map((item) => [item.id, item]));
  ids.forEach((id) => kept.set(keyOf(chat, id), found.get(id) ?? null));
  heard.forEach((listener) => listener());
};

const flush = () => {
  timer = null;
  const asks = [...waiting.entries()];
  waiting.clear();
  for (const [chat, { ids, api }] of asks) {
    const all = [...ids];
    for (let from = 0; from < all.length; from += BATCH) {
      const part = all.slice(from, from + BATCH);
      api
        .telegramFactChecks({ chat, ids: part })
        .catch(() => null)
        .then((reply) => answer(chat, part, reply?.ok ? reply.items : null));
    }
  }
};

/** Asks for a message's fact check, batched with the others of the moment. */
export const askFactCheck = (api, chat, id) => {
  if (
    kept.has(keyOf(chat, id)) ||
    typeof api?.telegramFactChecks !== 'function'
  ) {
    return;
  }
  const own = waiting.get(chat) ?? { ids: new Set(), api };
  own.ids.add(id);
  waiting.set(chat, own);
  kept.set(keyOf(chat, id), undefined);
  timer ??= globalThis.setTimeout(flush, WAIT_MS);
};

/** What a message's raw fact check shows now: the item, or null. */
export const factOfRaw = (raw, held) =>
  raw?.text?.text
    ? {
        country: raw.country ?? '',
        text: raw.text.text,
        entities: raw.text.entities ?? [],
      }
    : (held ?? null);

const useVisible = (on) => {
  const ref = useRef(null);
  const [seen, setSeen] = useState(!globalThis.IntersectionObserver);
  useEffect(() => {
    if (!on || seen || !ref.current) {
      return undefined;
    }
    const watch = new globalThis.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setSeen(true);
      }
    });
    watch.observe(ref.current);
    return () => watch.disconnect();
  }, [on, seen]);
  return [ref, seen];
};

const useHeld = (chat, id) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const listener = () => tick((n) => n + 1);
    heard.add(listener);
    return () => heard.delete(listener);
  }, []);
  return kept.get(keyOf(chat, id)) ?? null;
};

const countryName = (code, locale) => {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

const Box = ({ item, t, locale }) =>
  el('aside', { className: 'fact-check', 'data-fact-check': '' }, [
    el(
      'strong',
      { key: 'h', className: 'fact-check-title' },
      t('chat.factCheck.title')
    ),
    el(
      'div',
      { key: 'x', className: 'fact-check-text' },
      el(MessageText, { text: item.text, entities: item.entities })
    ),
    item.country
      ? el(
          'span',
          { key: 'c', className: 'meta fact-check-source' },
          t('chat.factCheck.source', {
            country: countryName(item.country, locale),
          })
        )
      : null,
  ]);

const Checked = ({ message, raw, api }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const chat = String(message.chat);
  const id = networkMessageId(message);
  const needs = raw.needCheck === true && !raw.text?.text;
  const [ref, seen] = useVisible(needs);
  const held = useHeld(chat, id);
  useEffect(() => {
    if (needs && seen) {
      askFactCheck(api, chat, id);
    }
  }, [needs, seen, api, chat, id]);
  const item = factOfRaw(raw, held);
  return item
    ? el(Box, { item, t, locale })
    : el('span', {
        ref,
        className: 'fact-check-pending',
        'aria-hidden': 'true',
      });
};

/** The fact check box under a message's text, or nothing. */
export const FactCheck = ({ message, api }) => {
  const raw = message?.raw?.factcheck;
  return raw && message.source === 'telegram' && message.chat
    ? el(Checked, { message, raw, api })
    : null;
};
