import { resolveOpenBrowserConversation } from '../browser-choice-document.js';
import { readBrowserHistory } from '../browser-choices.js';
import { archiveBrowserHistoryWindow } from '../browser-history-archive.js';
import { observeHhRead } from '../browser-hh-read.js';
import { hhReadRecord, storeHhReadState } from '../hh-chat-read.js';
import { HH_WEB_UI } from '../hh-web-ui.js';
import { scanBrowserConversation } from '../browser-conversation-history.js';

const openChatError = () =>
  Object.assign(
    new Error(
      'Open one HeadHunter conversation with visible messages in the import browser and try again.'
    ),
    { status: 409, code: 'hh-capture-open-chat' }
  );

const observeOpenHhChat = (document) =>
  document.evaluate({
    fn: observeHhRead,
    args: [
      {
        chat: document.chat,
        chats: HH_WEB_UI.chats,
        messages: HH_WEB_UI.messages,
        scroll: false,
      },
    ],
  });

const captureHistory = async (store, document, signal) => {
  const chat = `web:${document.chat}`;
  const read = await observeOpenHhChat(document).catch(() => {
    throw openChatError();
  });
  const chatName = read?.chatName?.slice(0, 4096);
  const saved = new Set();
  let imported = 0;
  const { coverage, restored } = await scanBrowserConversation(
    document,
    HH_WEB_UI,
    document.chat,
    {
      signal,
      onHistoryWindow: async ({ rows }) => {
        const window = await archiveBrowserHistoryWindow(store, {
          source: 'hh',
          chat,
          chatName,
          rows,
          signal,
        });
        imported += window.changed;
        for (const row of rows) {
          saved.add(row.id);
        }
      },
    }
  );
  return {
    name: chatName || `HeadHunter ${document.chat}`,
    imported,
    coverage,
    restored,
    saved: saved.size,
  };
};

export const captureHhConversation = async (
  store,
  { commander, page },
  { signal, history }
) => {
  const document = await resolveOpenBrowserConversation(
    commander,
    page,
    HH_WEB_UI
  ).catch(() => {
    throw openChatError();
  });
  if (history) {
    return captureHistory(store, document, signal);
  }
  return captureLoadedWindow(store, document, signal);
};

const captureLoadedWindow = async (store, document, signal) => {
  const chat = `web:${document.chat}`;
  let rows;
  let read;
  let checkedAt;
  try {
    rows = await readBrowserHistory(document, HH_WEB_UI, document.chat);
    if (!rows.length) {
      throw openChatError();
    }
    checkedAt = new Date().toISOString();
    read = await observeOpenHhChat(document);
  } catch {
    throw openChatError();
  }
  signal.throwIfAborted();
  const chatName = read?.chatName?.slice(0, 4096);
  const result = await archiveBrowserHistoryWindow(store, {
    source: 'hh',
    chat,
    rows,
    chatName,
    signal,
  });
  if (read && rows.at(-1)?.id === read.latestMessageId && !signal.aborted) {
    await storeHhReadState(
      store,
      hhReadRecord({ ...read, chat, chatName, checkedAt })
    );
    await store.flush?.();
  }
  return {
    name: chatName || `HeadHunter ${document.chat}`,
    imported: result.changed,
  };
};
