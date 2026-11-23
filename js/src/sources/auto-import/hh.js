import { resolveOpenBrowserConversation } from '../browser-choice-document.js';
import { readBrowserHistory } from '../browser-choices.js';
import { archiveBrowserHistoryWindow } from '../browser-history-archive.js';
import { observeHhRead } from '../browser-hh-read.js';
import { hhReadRecord, storeHhReadState } from '../hh-chat-read.js';
import { HH_WEB_UI } from '../hh-web-ui.js';

export const captureHhConversation = async (
  store,
  { commander, page },
  signal
) => {
  let chat;
  let rows;
  let read;
  let checkedAt;
  const ui = HH_WEB_UI;
  try {
    const document = await resolveOpenBrowserConversation(commander, page, ui);
    chat = document.chat;
    rows = await readBrowserHistory(document, ui, chat);
    checkedAt = new Date().toISOString();
    read = await document.evaluate({
      fn: observeHhRead,
      args: [{ chat, chats: ui.chats, messages: ui.messages, scroll: false }],
    });
  } catch {
    throw Object.assign(
      new Error(
        'Open one HeadHunter conversation with visible messages in the import browser and try again.'
      ),
      { status: 409, code: 'hh-capture-open-chat' }
    );
  }
  signal.throwIfAborted();
  const target = `web:${chat}`;
  const chatName = read?.chatName?.slice(0, 4096);
  const result = await archiveBrowserHistoryWindow(store, {
    source: 'hh',
    chat: target,
    rows,
    chatName,
    signal,
  });
  if (read && rows.at(-1)?.id === read.latestMessageId && !signal.aborted) {
    await storeHhReadState(
      store,
      hhReadRecord({ ...read, chat: target, chatName, checkedAt })
    );
    await store.flush?.();
  }
  return { name: chatName || `HeadHunter ${chat}`, imported: result.changed };
};
