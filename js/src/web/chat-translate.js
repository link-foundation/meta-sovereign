// Translating a message, as Telegram Desktop's "Translate" does (R-Y132;
// learned, never copied): the menu's "Translate…" opens a box with the
// original and the translation, and a list of languages to change it;
// Telegram's refusals (translations off in the chat, the quota used up,
// Premium needed) are told in words in the box.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { networkMessageId } from './chat-model.js';
import { Frame } from './chat-readers.js';
import { MessageText } from './message-text.js';

const el = React.createElement;

/** The languages offered, each named in its own language. */
export const LANGUAGES = [
  ['en', 'English'],
  ['ru', 'Русский'],
  ['es', 'Español'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['it', 'Italiano'],
  ['pt', 'Português'],
  ['uk', 'Українська'],
  ['pl', 'Polski'],
  ['tr', 'Türkçe'],
  ['ar', 'العربية'],
  ['hi', 'हिन्दी'],
  ['zh-CN', '中文'],
  ['ja', '日本語'],
  ['ko', '한국어'],
];

/** Whether the menu offers "Translate": a sent message with text. */
export const hasTranslation = (message) =>
  message?.source === 'telegram' &&
  !message.pending &&
  !message.service &&
  Boolean(String(message.body ?? '').trim()) &&
  networkMessageId(message) !== null;

/** The language to start with: the page's, else the browser's, else English. */
export const startLanguage = (locale, browser = globalThis.navigator) => {
  for (const tag of [locale, browser?.language]) {
    const base = String(tag ?? '')
      .split('-')[0]
      .toLowerCase();
    const found = LANGUAGES.find(([code]) => code.split('-')[0] === base);
    if (found) {
      return found[0];
    }
  }
  return 'en';
};

/** The length from which the menu offers a summary of a message (R-Y213). */
export const SUMMARY_MIN = 600;

/** Whether the menu offers "Summarize": a long sent message. */
export const hasSummary = (message) =>
  hasTranslation(message) && String(message.body).length > SUMMARY_MIN;

const errorText = (t, code) => {
  const key = `chat.translate.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.translate.err.failed') : text;
};

// What a call to the server answers, asked again when `deps` change.
const useCall = (call, deps, pick) => {
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ phase: 'loading' });
    Promise.resolve(call())
      .catch(() => null)
      .then((answer) => live && setState(pick(answer)));
    return () => {
      live = false;
    };
  }, deps);
  return state;
};

const readyOr = (item, answer) =>
  answer?.ok && item
    ? { phase: 'ready', item }
    : { phase: 'error', code: answer?.code };

// The translation of one message into `to`, asked again when `to` changes.
const useTranslation = (api, message, to) =>
  useCall(
    () =>
      api.telegramTranslate({
        chat: String(message.chat),
        ids: [networkMessageId(message)],
        to,
      }),
    [api, message, to],
    (answer) => readyOr(answer?.items?.[0], answer)
  );

const Block = ({ label, kind, children }) =>
  el('section', { className: 'translate-block', 'data-translate': kind }, [
    el('h3', { key: 'h', className: 'translate-label' }, label),
    el('div', { key: 'p', className: 'translate-text' }, children),
  ]);

const Result = ({ state, t }) => {
  if (state.phase === 'error') {
    const text = errorText(t, state.code);
    return el('p', { role: 'alert', className: 'translate-failed' }, text);
  }
  return state.phase === 'loading'
    ? el('span', { className: 'meta' }, t('chat.translate.loading'))
    : el(MessageText, {
        text: state.item.text,
        entities: state.item.entities,
      });
};

const TranslatePanel = ({ message, api, close }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const [to, setTo] = useState(() => startLanguage(locale));
  const [copied, setCopied] = useState(false);
  const state = useTranslation(api, message, to);
  const done = useRef(null);
  useEffect(() => () => globalThis.clearTimeout(done.current), []);
  const copy = useCallback(() => {
    const writing = globalThis.navigator?.clipboard?.writeText?.(
      state.item?.text ?? ''
    );
    Promise.resolve(writing).then(
      () => {
        setCopied(true);
        done.current = globalThis.setTimeout(() => setCopied(false), 2000);
      },
      () => {}
    );
  }, [state]);
  return el(
    Frame,
    { title: t('chat.translate.title'), close, name: 'translate' },
    [
      el(
        Block,
        { key: 'o', label: t('chat.translate.original'), kind: 'original' },
        el(MessageText, {
          text: String(message.body ?? ''),
          entities: message.raw?.entities,
        })
      ),
      el('label', { key: 'l', className: 'translate-pick' }, [
        el('span', { key: 's' }, t('chat.translate.to')),
        el(
          'select',
          {
            key: 'sel',
            'data-action': 'language',
            value: to,
            onChange: (e) => setTo(e.target.value),
          },
          LANGUAGES.map(([code, name]) =>
            el('option', { key: code, value: code }, name)
          )
        ),
      ]),
      el(
        Block,
        {
          key: 't',
          label: t('chat.translate.translation'),
          kind: 'translation',
        },
        el(Result, { state, t })
      ),
      el('div', { key: 'f', className: 'translate-foot' }, [
        copied
          ? el(
              'span',
              { key: 'c', className: 'meta', role: 'status' },
              t('chat.translate.copied')
            )
          : null,
        el(
          'button',
          {
            key: 'cp',
            type: 'button',
            'data-action': 'copy-translation',
            disabled: state.phase !== 'ready',
            onClick: copy,
          },
          t('chat.translate.copy')
        ),
        el(
          'button',
          {
            key: 'x',
            type: 'button',
            'data-action': 'close-translate',
            onClick: close,
          },
          t('chat.translate.close')
        ),
      ]),
    ]
  );
};

// The summary of one message in the page's language (R-Y213).
const useSummary = (api, message, locale) =>
  useCall(
    () =>
      api.telegramSummarize({
        chat: String(message.chat),
        id: networkMessageId(message),
        to: startLanguage(locale),
      }),
    [api, message, locale],
    (answer) => readyOr(answer, answer)
  );

const SummaryPanel = ({ message, api, close }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const state = useSummary(api, message, locale);
  return el(
    Frame,
    { title: t('chat.summarize.title'), close, name: 'summarize' },
    [
      el(
        Block,
        { key: 's', label: t('chat.summarize.label'), kind: 'summary' },
        el(Result, { state, t })
      ),
      el('div', { key: 'f', className: 'translate-foot' }, [
        el(
          'button',
          {
            key: 'x',
            type: 'button',
            'data-action': 'close-summary',
            onClick: close,
          },
          t('chat.translate.close')
        ),
      ]),
    ]
  );
};

/**
 * The boxes of the open chat: `{ open(message), summarize(message),
 * dialog }`.
 */
export const useTranslate = ({ api }) => {
  const [shown, setShown] = useState(null);
  const [summed, setSummed] = useState(null);
  const close = useCallback(() => {
    setShown(null);
    setSummed(null);
  }, []);
  let dialog = null;
  if (shown) {
    dialog = el(TranslatePanel, {
      key: 'translate',
      message: shown,
      api,
      close,
    });
  } else if (summed) {
    dialog = el(SummaryPanel, { key: 'summary', message: summed, api, close });
  }
  return { open: setShown, summarize: setSummed, dialog };
};
