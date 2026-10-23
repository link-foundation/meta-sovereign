// "Do not translate this chat", as Telegram Desktop's chat menu has it
// (R-Y209; learned, never copied): a header ⋯ menu item that turns the
// offer to translate a chat off (messages.togglePeerTranslations), or back
// on. The chat's info carries `translationsDisabled`; what was just set
// here is believed over that (cached) info.

import React, { useState, useSyncExternalStore } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

const own = new Map(); // chat -> disabled, as just set here
const listeners = new Set();
let version = 0;
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const remember = (chat, disabled) => {
  own.set(String(chat), disabled);
  version += 1;
  listeners.forEach((listener) => listener());
};

/** For tests: what was set here, forgotten. */
export const forgetTranslationSwitches = () => {
  own.clear();
};

/** Whether the offer to translate `chat` is off: set here, else its info's. */
export const translationsOff = (chat, info) =>
  own.has(String(chat))
    ? own.get(String(chat))
    : Boolean(info?.translationsDisabled);

/** Whether the menu offers the switch: a Telegram chat that is not ours. */
export const canSwitchTranslations = (chat, info, api) =>
  chat?.source === 'telegram' &&
  /^-?\d+$/.test(String(chat.chat)) &&
  !info?.self &&
  typeof api?.telegramTranslationsToggle === 'function';

/** The menu item; `done()` closes the menu once asked. */
export const TranslationSwitch = ({ api, chat, info, done }) => {
  const t = useT();
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  );
  const [failed, setFailed] = useState(false);
  if (!canSwitchTranslations(chat, info, api)) {
    return null;
  }
  const off = translationsOff(chat.chat, info);
  const flip = async () => {
    setFailed(false);
    const answer = await Promise.resolve(
      api.telegramTranslationsToggle({
        chat: String(chat.chat),
        disabled: !off,
      })
    ).catch(() => null);
    if (answer?.ok) {
      remember(chat.chat, !off);
      done();
    } else {
      setFailed(true);
    }
  };
  return el('div', { className: 'chat-more-group' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        role: 'menuitem',
        className: 'chat-more-item',
        'data-action': 'translations-toggle',
        onClick: flip,
      },
      off ? t('chat.translate.turnOn') : t('chat.translate.turnOff')
    ),
    failed
      ? el(
          'p',
          {
            key: 'e',
            role: 'alert',
            className: 'meta',
            'data-translate-error': 'true',
          },
          t('chat.translate.toggleFailed')
        )
      : null,
  ]);
};
