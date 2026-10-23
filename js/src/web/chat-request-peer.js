// A bot's "request peer" keyboard button (R-Y208), as Telegram Desktop has
// it (learned, never copied): pressing it opens a picker of only the
// chats or people that fit what the bot asked for (a person, a bot, a
// Premium user; a group or channel the user created, has a username, is a
// forum, or where the user holds some admin rights). The picker allows up
// to the button's number of choices and "Share" answers the bot
// (messages.sendBotRequestedPeer). The bot's own needs of the chat (that
// it can join, its rights) are Telegram's to check, and its refusal is
// told in words.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { networkMessageId } from './chat-model.js';
import { FormDialog, Picker } from './chat-create.js';

const el = React.createElement;

/** Whether `button` is a request-peer button the app can answer. */
export const canRequestPeer = (message, button) =>
  button?.kind === 'peer' &&
  Boolean(button.peerType) &&
  Number.isInteger(button.buttonId) &&
  networkMessageId(message) !== null;

/** The picked ids after `id` was toggled, never more than `max`. */
export const togglePicked = (picked, id, max) => {
  if (picked.has(id)) {
    const next = new Set(picked);
    next.delete(id);
    return next;
  }
  if (max <= 1) {
    return new Set([id]);
  }
  if (picked.size >= max) {
    return picked;
  }
  return new Set([...picked, id]);
};

/** The words for a code of the request's answers. */
export const requestErrorText = (t, code) => {
  const key = `chat.requestPeer.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.requestPeer.err.failed') : text;
};

// The chats that may answer, asked once.
const useCandidates = (api, type) => {
  const [state, setState] = useState({ phase: 'loading', people: [] });
  useEffect(() => {
    let active = true;
    api
      .telegramRequestPeerCandidates({ type })
      .catch(() => null)
      .then((answer) => {
        if (active) {
          setState(
            answer?.ok
              ? { phase: 'ready', people: answer.candidates ?? [] }
              : { phase: 'error', code: answer?.code ?? 'failed', people: [] }
          );
        }
      });
    return () => {
      active = false;
    };
  }, [api, JSON.stringify(type)]);
  return state;
};

const RequestDialog = ({ api, ask, chat, close }) => {
  const t = useT();
  const { message, button } = ask;
  const found = useCandidates(api, button.peerType);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const send = async () => {
    if (picked.size === 0) {
      setError(requestErrorText(t, 'none-picked'));
      return;
    }
    setBusy(true);
    const answer = await api
      .telegramRequestPeerSend({
        chat,
        msgId: networkMessageId(message),
        buttonId: button.buttonId,
        peers: [...picked],
      })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      close();
    } else {
      setError(requestErrorText(t, answer?.code ?? 'failed'));
    }
  };
  let body;
  if (found.phase === 'ready' && found.people.length === 0) {
    body = el(
      'p',
      { className: 'meta', 'data-request-peer': 'none' },
      t('chat.requestPeer.none')
    );
  } else if (found.phase === 'ready') {
    body = [
      el(
        'p',
        { key: 'hint', className: 'meta', 'data-request-peer': 'hint' },
        t(
          button.max > 1
            ? 'chat.requestPeer.hintMany'
            : 'chat.requestPeer.hintOne',
          { max: button.max }
        )
      ),
      el(Picker, {
        key: 'pick',
        contacts: found.people,
        picked,
        toggle: (id) => setPicked((now) => togglePicked(now, id, button.max)),
        t,
        placeholder: t('chat.requestPeer.search'),
        field: 'peer',
      }),
    ];
  } else {
    body = el(
      'p',
      { className: 'meta' },
      found.phase === 'loading'
        ? t('chat.create.loadingContacts')
        : requestErrorText(t, found.code)
    );
  }
  return el(
    FormDialog,
    {
      name: 'request-peer',
      title: button.text || t('chat.requestPeer.title'),
      onClose: close,
      onSubmit: send,
      submit: t('chat.requestPeer.share'),
      busy,
      error,
    },
    body
  );
};

/**
 * `{ open(message, button), dialog }`: `open` shows the picker for a
 * request-peer button of `message` and tells whether it could.
 */
export const useRequestPeer = ({ state, api }) => {
  const [ask, setAsk] = useState(null);
  const chat = state.current?.chat ? String(state.current.chat) : null;
  const ready =
    Boolean(chat) &&
    typeof api?.telegramRequestPeerCandidates === 'function' &&
    typeof api?.telegramRequestPeerSend === 'function';
  const key = state.current?.key;
  useEffect(() => setAsk(null), [key]);
  return {
    open: (message, button) => {
      if (!ready || !canRequestPeer(message, button)) {
        return false;
      }
      setAsk({ message, button });
      return true;
    },
    dialog: ask
      ? el(RequestDialog, {
          key: 'request-peer',
          api,
          ask,
          chat,
          close: () => setAsk(null),
        })
      : null,
  };
};
