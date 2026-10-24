// The question before a message with a sign-in code goes out (R-Y218;
// learned, never copied): "This message holds your Telegram login code.
// Anyone who gets it can enter your account." Send anyway invalidates the
// code and sends; Cancel sends nothing (./sign-in-code-guard.js holds the
// rule).

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { overPage } from './paid-portal.js';
import { bindCodeAsk } from './sign-in-code-guard.js';

const el = React.createElement;

/** The composer's part: the dialog element, or null when nothing is asked. */
export const useSignInCodeWarning = () => {
  const t = useT();
  const [asks, setAsks] = useState([]);
  const open = useRef([]);
  const settle = (entry, value) => {
    open.current = open.current.filter((one) => one !== entry);
    setAsks(open.current);
    entry.resolve(value);
  };
  useEffect(() => {
    const unbind = bindCodeAsk(
      (offer) =>
        new Promise((resolve) => {
          open.current = [...open.current, { offer, resolve }];
          setAsks(open.current);
        })
    );
    return () => {
      unbind();
      for (const entry of open.current) {
        entry.resolve(false);
      }
      open.current = [];
    };
  }, []);
  const first = asks[0];
  return first
    ? el(
        React.Fragment,
        { key: 'sign-in-code' },
        overPage(
          el(
            FormDialog,
            {
              name: 'sign-in-code',
              title: t('chat.signInCode.title'),
              onClose: () => settle(first, false),
              onSubmit: () => settle(first, true),
              submit: t('chat.signInCode.send'),
              outside: true,
            },
            el('p', { key: 'p' }, t('chat.signInCode.body'))
          )
        )
      )
    : null;
};
