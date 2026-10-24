// What the translate bar keeps on the page (R-Y213; learned, never
// copied): per device whether whole chats are offered for translation and
// which languages are never offered; in memory which chats are shown
// translated (and into what), the translated texts by chat, message and
// language, the chats whose bar was closed and the last refusal. A message
// draws its text through `useTranslated`, so the store is light: it
// imports no screens.

import { useRedrawOn } from './use-redraw.js';
import { readPref, writePref } from './chat-notify.js';
import { networkMessageId } from './chat-model.js';

export const TRANSLATE_CHATS_KEY = 'metaSovereignTranslateChats';
export const SKIP_LANGUAGES_KEY = 'metaSovereignTranslateSkip';

/** Whether whole chats are offered for translation on this device. */
export const translateChatsOn = () => readPref(TRANSLATE_CHATS_KEY, false);
export const setTranslateChats = (on) => writePref(TRANSLATE_CHATS_KEY, on);

/** The language codes never offered for translation on this device. */
export const skippedLanguages = (storage = globalThis.localStorage) => {
  try {
    const list = JSON.parse(storage?.getItem(SKIP_LANGUAGES_KEY) ?? '[]');
    return Array.isArray(list)
      ? list.filter((code) => typeof code === 'string')
      : [];
  } catch {
    return [];
  }
};

const shown = new Map(); // chat -> the language it is shown in
const kept = new Map(); // chat:id:language -> { id, text, entities }
const closed = new Set(); // chats whose bar was closed
const failed = new Map(); // chat -> the code of the last refusal
const EVENT = 'ms-translate-store';
const changed = () => globalThis.dispatchEvent?.(new CustomEvent(EVENT));

/** Redraws the component when the store changes. */
export const useTranslateStore = () => useRedrawOn(EVENT);

export const skipLanguage = (code, storage = globalThis.localStorage) => {
  shown.clear();
  failed.clear();
  const list = skippedLanguages(storage);
  if (!list.includes(code)) {
    try {
      storage?.setItem(SKIP_LANGUAGES_KEY, JSON.stringify([...list, code]));
    } catch {
      // Private mode: the choice lasts for this page only.
    }
  }
  changed();
};

const key = (chat, id, to) => `${chat}:${id}:${to}`;

export const shownLanguage = (chat) => shown.get(String(chat)) ?? null;
export const isClosed = (chat) => closed.has(String(chat));
export const failureOfChat = (chat) => failed.get(String(chat)) ?? null;

export const showTranslated = (chat, to) => {
  failed.delete(String(chat));
  shown.set(String(chat), to);
  changed();
};
export const showOriginal = (chat) => {
  failed.delete(String(chat));
  shown.delete(String(chat));
  changed();
};
export const closeBar = (chat) => {
  shown.delete(String(chat));
  closed.add(String(chat));
  changed();
};

/** For tests: everything forgotten. */
export const forgetTranslateStore = () => {
  shown.clear();
  kept.clear();
  closed.clear();
  failed.clear();
  changed();
};

/** The kept translation of a message in its chat's language, or null. */
export const translatedItem = (message) => {
  const to = shown.get(String(message?.chat));
  return to
    ? (kept.get(key(message.chat, networkMessageId(message), to)) ?? null)
    : null;
};

/** The message's translated `{ text, entities }` while its chat is shown so. */
export const useTranslated = (message) => {
  useTranslateStore();
  return translatedItem(message);
};

const BATCH = 20;
const MAX_KEPT = 1000;

/** Which of `messages` still wait for a translation into `to`. */
export const missingIds = (messages, to) =>
  messages
    .filter((m) => !kept.has(key(m.chat, networkMessageId(m), to)))
    .map((m) => networkMessageId(m));

/**
 * Asks for the translations of `messages` (one chat) into `to`, 20 at a
 * time; what comes is kept, a refusal is kept as the chat's failure.
 */
export const translateBatch = async (api, chat, messages, to) => {
  const ids = missingIds(messages, to);
  for (let from = 0; from < ids.length; from += BATCH) {
    const answer = await Promise.resolve(
      api.telegramTranslate({
        chat: String(chat),
        ids: ids.slice(from, from + BATCH),
        to,
      })
    ).catch(() => null);
    if (shown.get(String(chat)) !== to) {
      return;
    }
    if (!answer?.ok) {
      failed.set(String(chat), answer?.code ?? 'failed');
      changed();
      return;
    }
    for (const item of answer.items ?? []) {
      kept.set(key(chat, item.id, to), item);
    }
    while (kept.size > MAX_KEPT) {
      kept.delete(kept.keys().next().value);
    }
    changed();
  }
};
