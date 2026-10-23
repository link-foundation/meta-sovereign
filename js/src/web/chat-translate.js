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

const errorText = (t, code) => {
  const key = `chat.translate.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.translate.err.failed') : text;
};

// The translation of one message into `to`, asked again when `to` changes.
const useTranslation = (api, message, to) => {
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ phase: 'loading' });
    api
      .telegramTranslate({
        chat: String(message.chat),
        ids: [networkMessageId(message)],
        to,
      })
      .catch(() => null)
      .then((answer) => {
        const item = answer?.items?.[0];
        if (live) {
          setState(
            answer?.ok && item
              ? { phase: 'ready', item }
              : { phase: 'error', code: answer?.code }
          );
        }
      });
    return () => {
      live = false;
    };
  }, [api, message, to]);
  return state;
};

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

/** The box of the open chat: `{ open(message), dialog }`. */
export const useTranslate = ({ api }) => {
  const [shown, setShown] = useState(null);
  const close = useCallback(() => setShown(null), []);
  return {
    open: setShown,
    dialog: shown
      ? el(TranslatePanel, { key: 'translate', message: shown, api, close })
      : null,
  };
};
