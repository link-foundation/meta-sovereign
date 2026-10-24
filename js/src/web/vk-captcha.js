// VK's captcha (error 14) on something the user asked for (R-Z20), e.g. the
// older messages of a VK chat when scrolling up. `askVkCaptcha(challenge)`
// resolves with the characters the user typed, or null when they cancel; the
// caller then repeats its request ONCE with `captcha_sid` and `captcha_key`.
// Nothing here solves a captcha, and background pulls never reach it: they
// back off and mark the connection as needing attention instead.
//
// The dialog is the shared form dialog (Escape closes the top one through
// `useEsc`, the input has the focus). `challenge.img` is a picture on VK's
// own API host, which the page's CSP `img-src` allows.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Field, FormDialog } from './chat-create.js';

const el = React.createElement;

let open = null;
const watchers = new Set();
const show = (next) => {
  open = next;
  for (const watcher of watchers) {
    watcher(next);
  }
};

/** Ask the user to type the captcha; resolves to the text or null. */
export const askVkCaptcha = (challenge) =>
  new Promise((resolve) => {
    if (open) {
      // One dialog at a time: a second request waits for the next try.
      resolve(null);
      return;
    }
    show({ challenge, resolve });
  });

/** Mount once in the chat view; shows the dialog while a captcha is asked. */
export const VkCaptchaDialog = () => {
  const t = useT();
  const [state, setState] = useState(open);
  const [text, setText] = useState('');
  useEffect(() => {
    watchers.add(setState);
    setState(open);
    return () => {
      watchers.delete(setState);
    };
  }, []);
  if (!state) {
    return null;
  }
  const done = (value) => {
    setText('');
    show(null);
    state.resolve(value);
  };
  const { img } = state.challenge;
  return el(
    FormDialog,
    {
      name: 'vk-captcha',
      title: t('vk.captcha.title'),
      submit: t('vk.captcha.submit'),
      busy: !img,
      onClose: () => done(null),
      onSubmit: () => text.trim() && done(text.trim()),
      error: img ? '' : t('vk.captcha.noImage'),
    },
    [
      el('p', { key: 'hint', className: 'meta' }, t('vk.captcha.hint')),
      img
        ? el('img', {
            key: 'img',
            className: 'vk-captcha-img',
            src: img,
            alt: t('vk.captcha.image'),
            referrerPolicy: 'no-referrer',
          })
        : null,
      img
        ? el(Field, {
            key: 'field',
            name: 'captcha',
            label: t('vk.captcha.label'),
            value: text,
            autoFocus: true,
            autoComplete: 'off',
            maxLength: 32,
            onChange: (event) => setText(event.target.value),
          })
        : null,
    ]
  );
};
