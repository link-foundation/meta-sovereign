/* global document */

import { setTimeout as sleep } from 'node:timers/promises';
import { resolveBrowserChoiceDocument } from './browser-choice-document.js';
import { hhReadRecord } from './hh-chat-read.js';

// The provider can acknowledge opening a conversation. Inspect and scroll
// only an already-open, verified pane with the requested visible boundary.
export const observeHhRead = ({ chat, chats, messages, id, scroll }) => {
  const chatId = new RegExp(chats.idPattern);
  const visible = (element) =>
    element?.getClientRects().length > 0 &&
    !element.closest('[hidden], [aria-hidden="true"]');
  const unreadOf = (row) => {
    const badge = row.querySelector(chats.unread);
    const label = badge?.textContent.trim();
    return badge ? (/^\d+$/u.test(label) ? Number(label) : null) : 0;
  };
  const scrollIfRequested = (last, unreadCount, latestMessageId) => {
    if (
      scroll &&
      unreadCount > 0 &&
      (id === undefined || id === latestMessageId)
    ) {
      last.scrollIntoView({ block: 'end' });
    }
  };
  const rows = [...document.querySelectorAll(chats.item)].filter(
    (row) =>
      chatId.exec(row.getAttribute(chats.idAttribute))?.[1] === chat &&
      visible(row)
  );
  const [row] = rows;
  if (rows.length !== 1) {
    return null;
  }
  const link = row.matches(chats.link) ? row : row.querySelector(chats.link);
  if (
    link &&
    new RegExp(chats.linkPattern).exec(link.getAttribute('href'))?.[1] !== chat
  ) {
    return null;
  }
  const last = [...document.querySelectorAll(messages.item)].at(-1);
  const latestMessageId = new RegExp(messages.idPattern).exec(
    last?.getAttribute(messages.idAttribute)
  )?.[1];
  if (!latestMessageId || !visible(last)) {
    return null;
  }
  const unreadCount = unreadOf(row);
  if (!Number.isSafeInteger(unreadCount)) {
    return null;
  }
  const chatName = row.querySelector(chats.title)?.textContent.trim();
  scrollIfRequested(last, unreadCount, latestMessageId);
  return { chatName, unreadCount, latestMessageId };
};

const failure = (message, code) =>
  Object.assign(new Error(message), { code, read: false, fallback: false });

const waitForRead = async (observe, before, deadline) => {
  let state = before;
  while (globalThis.performance.now() < deadline) {
    const fresh = await observe(false);
    const remaining = deadline - globalThis.performance.now();
    if (remaining < 0) {
      break;
    }
    state = fresh;
    if (
      !state ||
      !state.unreadCount ||
      state.latestMessageId !== before.latestMessageId
    ) {
      return state;
    }
    await sleep(Math.min(50, remaining));
  }
  return state;
};

export const readHhBrowserChat = (ctx, ui, { chat, id }) => {
  const target = ui.target({ chat });
  return ctx.inExisting('hh', async (commander, page) => {
    const document = await resolveBrowserChoiceDocument(
      commander,
      page,
      ui,
      target
    );
    const observe = async (scroll) => {
      const checkedAt = new Date().toISOString();
      const read = await document.evaluate({
        fn: observeHhRead,
        args: [
          { chat: target, chats: ui.chats, messages: ui.messages, id, scroll },
        ],
      });
      return read ? { ...read, checkedAt } : null;
    };
    const before = await observe(true);
    if (!before) {
      throw failure(
        'HeadHunter has not reported the unread state here',
        'read-unconfirmed'
      );
    }
    if (!before.unreadCount) {
      return {
        read: true,
        readState: hhReadRecord({ chat: target, ...before }),
      };
    }
    if (id !== undefined && id !== before.latestMessageId) {
      throw failure(
        'HeadHunter has newer history. Refresh the chat before marking it read.',
        'history-changed'
      );
    }
    const after = await waitForRead(
      observe,
      before,
      globalThis.performance.now() + 2500
    );
    if (!after) {
      throw failure(
        'HeadHunter did not confirm a read state',
        'read-unconfirmed'
      );
    }
    return {
      read:
        after.unreadCount === 0 &&
        after.latestMessageId === before.latestMessageId,
      readState: hhReadRecord({ chat: target, ...after }),
    };
  });
};
