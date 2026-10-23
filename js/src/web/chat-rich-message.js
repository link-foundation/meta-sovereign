// A rich message in its bubble (R-Y220; learned, never copied): layer 232
// lets a message carry page blocks (headings, lists, formulas, a folded
// "thinking" part, buttons, files) instead of text, as bots and assistants
// send them. They are shaped like an Instant View page
// (telegram-instant-view-shape.js `shapeRich`) and drawn by the same
// renderer (chat-instant-view-render.js). The pure helpers are in
// rich-message-model.js.

import React, { useEffect, useMemo, useState } from 'react';
import { useLocaleContext } from './i18n.js';
import { Blocks } from './chat-instant-view-render.js';
import { BotButton } from './chat-bots.js';
import { buttonOf } from './bot-keyboard.js';
import { shapeRich } from '../sources/telegram-instant-view-shape.js';
import { richFiles, wordsOf, fileKey } from './rich-message-model.js';

const el = React.createElement;

/** The button a rich message's button stands for (an inline keyboard's). */
export const richButton = (one) =>
  buttonOf({ text: wordsOf(one.c), style: one.style, type: one.type });

const useUrls = (api, chat, msgId, shaped) => {
  const [urls, setUrls] = useState({});
  const files = richFiles(shaped).join(',');
  useEffect(() => {
    let live = true;
    if (!files || typeof api?.telegramMediaUrl !== 'function') {
      return undefined;
    }
    const ask = (key, call) =>
      Promise.resolve(call)
        .then((url) => [key, url])
        .catch(() => [key, null]);
    // A document also has its whole file: to play, and to save (R-Y224).
    const whole = (rich) =>
      typeof api.telegramFileUrl === 'function' && rich.startsWith('document:')
        ? [false, true].map((download) =>
            ask(
              fileKey(rich.slice(9), download),
              api.telegramFileUrl({ chat, id: msgId, rich, download })
            )
          )
        : [];
    Promise.all(
      files
        .split(',')
        .flatMap((rich) => [
          ask(rich, api.telegramMediaUrl({ chat, id: msgId, size: 'x', rich })),
          ...whole(rich),
        ])
    ).then((pairs) => live && setUrls(Object.fromEntries(pairs)));
    return () => {
      live = false;
    };
  }, [api, chat, msgId, files]);
  return urls;
};

const RichButton = ({ one, message, onAction }) => {
  const [busy, setBusy] = useState(false);
  const button = richButton(one);
  if (!button) {
    return el(
      'button',
      { type: 'button', className: 'bot-button', disabled: true },
      wordsOf(one.c)
    );
  }
  return el(BotButton, {
    button,
    busy,
    onPress: () => {
      setBusy(true);
      Promise.resolve(onAction?.('bot', message, button)).finally(() =>
        setBusy(false)
      );
    },
  });
};

/** The blocks of `message`'s rich part, in its bubble. */
export const RichMessage = ({ rich, api, chat, msgId, message, onAction }) => {
  const { t, locale } = useLocaleContext();
  const shaped = useMemo(() => shapeRich(rich), [rich]);
  const urls = useUrls(api, chat, msgId, shaped);
  const ctx = useMemo(
    () => ({
      t,
      locale,
      media: (kind, id) => urls[`${kind}:${id}`] ?? null,
      file: (id, download) => urls[fileKey(id, download)] ?? null,
      scrollTo: () => {},
      button: (one, key) => el(RichButton, { key, one, message, onAction }),
    }),
    [t, locale, urls, message, onAction]
  );
  return el(
    'div',
    {
      className: 'rich-message',
      'data-rich': shaped.part ? 'part' : 'whole',
      dir: shaped.rtl ? 'rtl' : 'ltr',
    },
    [
      el(Blocks, { key: 'b', blocks: shaped.blocks, ctx }),
      shaped.part
        ? el(
            'span',
            {
              key: 'p',
              className: 'rich-part',
              'aria-label': t('chat.rich.writing'),
            },
            '…'
          )
        : null,
    ]
  );
};
