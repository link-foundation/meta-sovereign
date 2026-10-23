// A click on a link to a message opens it inside the app (R-Y154; learned,
// never copied): a private t.me/c/… link in a chat the app knows, a public
// t.me/username/… link whose username is the open chat's or resolves to a
// chat (contacts.resolveUsername). The chat opens and the message is
// scrolled to and highlighted, as a reply's jump does; anything else
// opens in the browser as before.

import { useEffect, useRef } from 'react';
import { chatKey } from './chat-model.js';
import { channelChat, onMessageLink } from './message-links.js';

// Chats a username resolved to this session (a username keeps its chat).
const resolved = new Map();

/** Forgets what usernames resolved to (the tests'). */
export const forgetResolved = () => resolved.clear();

const browser = (href) =>
  globalThis.open?.(href, '_blank', 'noopener,noreferrer');

// The open chat, when the username is its own.
const ownChat = (state, username) =>
  state.current?.chat?.startsWith('-100') &&
  String(state.info?.username ?? '').toLowerCase() === username.toLowerCase()
    ? { chat: state.current.chat, name: state.current.name }
    : null;

// The chat a link names, or null (the browser then has it).
const chatOf = async ({ state, api }, link) => {
  if (link.channel) {
    const chat = channelChat(link.channel);
    return state.hasChat?.(chatKey('telegram', chat))
      ? { chat, name: undefined }
      : null;
  }
  const own = ownChat(state, link.username);
  if (own) {
    return own;
  }
  const name = link.username.toLowerCase();
  if (!resolved.has(name) && typeof api?.telegramResolveLink === 'function') {
    const answer = await api
      .telegramResolveLink({ username: link.username })
      .catch(() => null);
    if (answer?.ok && answer.chat) {
      resolved.set(name, answer);
    }
  }
  return resolved.get(name) ?? null;
};

const open = async (latest, { href, link }) => {
  const { state } = latest.current;
  const target = await chatOf(latest.current, link);
  if (!target) {
    browser(href);
    return;
  }
  state.openAt?.(
    {
      source: 'telegram',
      chat: target.chat,
      name: target.name,
      kind: target.kind === 'channel' ? 'channel' : 'group',
    },
    `msg:telegram:${target.chat}:${link.id}`
  );
};

/** Mounted once in the chat screen: opens the links messages hold. */
export const useMessageLinks = ({ state, api }) => {
  const latest = useRef({ state, api });
  latest.current = { state, api };
  useEffect(() => onMessageLink((detail) => open(latest, detail)), []);
};
