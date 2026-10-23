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
import { richFiles, wordsOf } from './rich-message-model.js';

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
    Promise.all(
      files.split(',').map((rich) =>
        Promise.resolve(
          api.telegramMediaUrl({ chat, id: msgId, size: 'x', rich })
        )
          .then((url) => [rich, url])
          .catch(() => [rich, null])
      )
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
