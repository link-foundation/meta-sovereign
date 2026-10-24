// The translate bar, as Telegram Desktop and the mobile apps have it
// (R-Y213; learned, never copied): when "Translate entire chats" is on in
// Settings, the account has Premium and a chat's recent incoming messages
// are mostly in another language than the page's, a slim bar at the top of
// the chat offers "Translate to <language>". Pressed, the messages shown
// are drawn translated (./translate-store.js keeps them) and the bar
// offers "Show original". Its ⋯ menu: another language, never translate
// this language, never translate this chat (R-Y209), Close. Telegram's
// refusals are told in the bar in words.

import React, { useEffect, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { Icon } from './icons.js';
import { useEsc } from './chat-invite.js';
import { LANGUAGES, hasTranslation, startLanguage } from './chat-translate.js';
import { foreignLanguage } from './translate-detect.js';
import {
  switchTranslations,
  translationsOff,
  useTranslationSwitches,
} from './chat-translation-switch.js';
import {
  closeBar,
  setTranslateChats,
  failureOfChat,
  isClosed,
  shownLanguage,
  showOriginal,
  showTranslated,
  skipLanguage,
  skippedLanguages,
  translateBatch,
  translateChatsOn,
  useTranslateStore,
} from './translate-store.js';

const el = React.createElement;

const RECENT = 20; // incoming messages whose language is looked at
const SHOWN = 40; // newest messages translated at once

/** The name of a language code in its own language, else the code. */
export const languageName = (code) =>
  LANGUAGES.find(
    ([c]) => c === code || c.split('-')[0] === String(code).split('-')[0]
  )?.[1] ?? String(code);

const incoming = (messages) =>
  messages.filter((m) => hasTranslation(m) && m.sender !== 'me' && !m.outgoing);

// Whether the account has Premium, asked once while the bar may show.
const usePremium = (api, wanted) => {
  const [premium, setPremium] = useState(false);
  useEffect(() => {
    if (!wanted || typeof api?.telegramTranslateAccount !== 'function') {
      return undefined;
    }
    let live = true;
    Promise.resolve(api.telegramTranslateAccount())
      .catch(() => null)
      .then((answer) => live && setPremium(Boolean(answer?.premium)));
    return () => {
      live = false;
    };
  }, [api, wanted]);
  return premium;
};

const MenuItem = ({ action, onClick, children }) =>
  el(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      className: 'chat-more-item',
      'data-action': action,
      onClick,
    },
    children
  );

const BarMenu = ({ t, language, close, choose, skip, stop, hide }) => {
  const [picking, setPicking] = useState(false);
  useEsc(close);
  const list = picking
    ? LANGUAGES.map(([code, name]) =>
        el(
          MenuItem,
          {
            key: code,
            action: `translate-to-${code}`,
            onClick: () => choose(code),
          },
          name
        )
      )
    : [
        el(
          MenuItem,
          {
            key: 'o',
            action: 'translate-other',
            onClick: () => setPicking(true),
          },
          t('chat.translateBar.other')
        ),
        language
          ? el(
              MenuItem,
              { key: 's', action: 'translate-skip', onClick: skip },
              t('chat.translateBar.skip', { language: languageName(language) })
            )
          : null,
        el(
          MenuItem,
          { key: 'c', action: 'translate-stop', onClick: stop },
          t('chat.translate.turnOff')
        ),
        el(
          MenuItem,
          { key: 'x', action: 'translate-hide', onClick: hide },
          t('chat.translate.close')
        ),
      ];
  return el(
    'div',
    {
      className: 'chat-menu-list',
      role: 'menu',
      'data-translate-menu': 'true',
    },
    list
  );
};

// What the bar says and offers, by phase.
const BarMain = ({ t, to, active, failed, onTranslate, onOriginal }) => {
  if (failed) {
    const key = `chat.translate.err.${failed}`;
    const text = t(key);
    return el(
      'span',
      {
        className: 'translate-bar-text',
        role: 'alert',
        'data-translate-bar-error': failed,
      },
      text === key ? t('chat.translate.err.failed') : text
    );
  }
  return el(
    'button',
    {
      type: 'button',
      className: 'translate-bar-main',
      'data-action': active ? 'translate-original' : 'translate-bar-go',
      onClick: active ? onOriginal : onTranslate,
    },
    active
      ? t('chat.translateBar.original')
      : t('chat.translateBar.to', { language: languageName(to) })
  );
};

const eligible = (chat, api) =>
  chat?.source === 'telegram' &&
  /^-?\d+$/.test(String(chat.chat)) &&
  typeof api?.telegramTranslate === 'function';

const Bar = ({ api, state }) => {
  const { t, locale } = useLocaleContext();
  useTranslateStore();
  useTranslationSwitches();
  const [menu, setMenu] = useState(false);
  const chat = state.current;
  const key = String(chat?.chat);
  const on = translateChatsOn() && eligible(chat, api);
  const premium = usePremium(api, on);
  const ui = startLanguage(locale);
  const messages = state.messages ?? [];
  const mine = incoming(messages);
  const active = shownLanguage(key);
  const language = foreignLanguage(
    mine.slice(-RECENT).map((m) => String(m.body)),
    ui,
    skippedLanguages()
  );
  const visible = mine.slice(-SHOWN);
  const ids = visible.map((m) => m.id).join(',');
  useEffect(() => {
    if (active) {
      translateBatch(api, key, visible, active);
    }
  }, [api, key, active, ids]);
  const off = translationsOff(chat?.chat, state.info);
  if (!on || !premium || off || isClosed(key) || !(language || active)) {
    return null;
  }
  const failed = failureOfChat(key);
  const choose = (code) => {
    setMenu(false);
    showTranslated(key, code);
  };
  return el('div', { className: 'translate-bar', 'data-translate-bar': key }, [
    el(BarMain, {
      key: 'm',
      t,
      to: ui,
      active: Boolean(active) && !failed,
      failed,
      onTranslate: () => choose(ui),
      onOriginal: () => showOriginal(key),
    }),
    el('div', { key: 'menu', className: 'chat-menu chat-more' }, [
      el(
        'button',
        {
          key: 'b',
          type: 'button',
          className: 'chat-more-toggle icon-btn',
          'data-action': 'translate-bar-more',
          'aria-haspopup': 'menu',
          'aria-expanded': menu ? 'true' : 'false',
          'aria-label': t('chat.translateBar.more'),
          onClick: () => setMenu(!menu),
        },
        el(Icon, { name: 'dots' })
      ),
      menu
        ? el(BarMenu, {
            key: 'l',
            t,
            language,
            close: () => setMenu(false),
            choose,
            skip: () => {
              setMenu(false);
              showOriginal(key);
              skipLanguage(language);
            },
            stop: () => {
              setMenu(false);
              showOriginal(key);
              switchTranslations(api, key, true);
            },
            hide: () => {
              setMenu(false);
              closeBar(key);
            },
          })
        : null,
    ]),
  ]);
};

/** The bar over the open chat; nothing when it has no reason to show. */
export const TranslateBar = ({ api, state }) =>
  el(Bar, { key: String(state.current?.chat), api, state });

/** Settings → Language: "Translate entire chats", kept per device. */
export const TranslateSettings = () => {
  const t = useT();
  const [on, setOn] = useState(translateChatsOn);
  return el(
    'section',
    {
      className: 'card',
      'aria-labelledby': 'translate-title',
      'data-section': 'translate',
    },
    [
      el(
        'h3',
        { key: 'h', id: 'translate-title' },
        t('settings.translate.title')
      ),
      el('label', { key: 'c', className: 'check' }, [
        el('input', {
          key: 'i',
          type: 'checkbox',
          checked: on,
          'data-action': 'translate-chats',
          onChange: (e) => {
            setTranslateChats(e.target.checked);
            setOn(e.target.checked);
          },
        }),
        ` ${t('settings.translate.chats')}`,
      ]),
      el('p', { key: 'p', className: 'meta' }, t('settings.translate.hint')),
    ]
  );
};
