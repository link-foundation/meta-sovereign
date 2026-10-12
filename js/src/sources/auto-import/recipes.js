/**
 * Browser auto-import recipes, one per provider in `sourceRegistry`.
 *
 * Every recipe opens `url` in a real browser driven by
 * browser-commander. The user signs in there (the profile is kept per
 * provider, so it is a one-time step) and starts the service's own data
 * export; every file the browser downloads is captured, unpacked when
 * it is a ZIP / tar.gz, and each entry whose path matches `files` is
 * handed to the provider's `parseArchive`.
 *
 * `toArchive(name, text)` adapts a raw export file to the shape the
 * adapter's `parseArchive` expects (CSV rows, X's `window.YTD = ...`
 * scripts). Without it JSON files are parsed and anything else is
 * passed through as text.
 *
 * `domains` are the sites whose sign-in cookies the import window may
 * reuse from the user's own browsers (see ./sign-ins.js).
 *
 * Services without a downloadable export in the browser (Telegram Web,
 * WhatsApp Web) also carry a `scrape` config: "Capture this page"
 * reads the messages of the chat currently open in the browser.
 */

import { parseCsv } from './archive.js';

// X archives ship data as `window.YTD.<name>.part0 = [ ... ]`.
const ytdPayload = (text) => JSON.parse(text.replace(/^[^=[]*=\s*/, ''));

const xToArchive = (name, text) => {
  const items = ytdPayload(text);
  if (/direct-messages/i.test(name)) {
    const dms = [];
    for (const item of items) {
      const conversation = item.dmConversation ?? item;
      for (const message of conversation.messages ?? []) {
        const create = message.messageCreate;
        if (create) {
          dms.push({
            id: create.id,
            senderId: create.senderId,
            conversationId: conversation.conversationId,
            text: create.text,
            createdAt: create.createdAt,
          });
        }
      }
    }
    return { dms };
  }
  return { tweets: items };
};

// LinkedIn headers are "CONVERSATION ID", "FROM", ...; the adapter
// reads them as CONVERSATION_ID, FROM, ...
const linkedinToArchive = (_name, text) => ({
  messages: parseCsv(text).map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k.trim().toUpperCase().replace(/\s+/g, '_'),
        v,
      ])
    )
  ),
});

export const autoImportRecipes = {
  email: {
    url: 'https://takeout.google.com/settings/takeout/custom/gmail',
    domains: ['google.com'],
    files: /\.(mbox|eml)$/i,
  },
  telegram: {
    url: 'https://web.telegram.org/a/',
    domains: ['telegram.org'],
    files: /(^|\/)result\.json$/i,
    scrape: {
      chat: '.MiddleHeader .fullName, .chat-info .peer-title',
      message: '.Message[data-message-id], .bubble[data-mid]',
      id: ['data-message-id', 'data-mid'],
      sender: '.message-title .sender-title, .peer-title.name',
      text: '.text-content, .message .translatable-message, .message',
      time: '.message-time, .time-inner',
      own: ['own', 'is-out'],
    },
  },
  vk: {
    url: 'https://vk.com/data_protection?section=rules',
    domains: ['vk.com', 'vk.ru'],
    files: /messages.*\.json$/i,
  },
  x: {
    url: 'https://x.com/settings/download_your_data',
    domains: ['x.com', 'twitter.com'],
    files: /(^|\/)(tweets|direct-messages)(-part\d+)?\.js(on)?$/i,
    toArchive: xToArchive,
  },
  whatsapp: {
    url: 'https://web.whatsapp.com/',
    domains: ['whatsapp.com'],
    files: /\.txt$/i,
    scrape: {
      chat: '#main header span[dir="auto"]',
      message: '#main div[data-id]',
      id: ['data-id'],
      // "[12:34, 10/12/2026] Alice: " carries both the time and sender.
      meta: '.copyable-text[data-pre-plain-text]',
      metaAttribute: 'data-pre-plain-text',
      text: '.selectable-text',
      own: ['message-out'],
    },
  },
  facebook: {
    url: 'https://accountscenter.facebook.com/info_and_permissions/dyi/',
    domains: ['facebook.com'],
    files: /(message_\d+|messages_[^/]*|posts_[^/]*)\.json$/i,
  },
  linkedin: {
    url: 'https://www.linkedin.com/mypreferences/d/download-my-data',
    domains: ['linkedin.com'],
    files: /(^|\/)messages\.csv$/i,
    toArchive: linkedinToArchive,
  },
  'habr-career': {
    url: 'https://career.habr.com/',
    domains: ['habr.com'],
    files: /\.json$/i,
  },
  hh: {
    url: 'https://hh.ru/applicant/negotiations',
    domains: ['hh.ru'],
    files: /\.json$/i,
  },
  superjob: {
    url: 'https://www.superjob.ru/',
    domains: ['superjob.ru'],
    files: /\.json$/i,
  },
  github: {
    url: 'https://github.com/settings/admin',
    domains: ['github.com'],
    files: /(issues|pull_requests|pulls|issue_comments|comments)[^/]*\.json$/i,
  },
  upwork: {
    url: 'https://www.upwork.com/nx/reports/transaction-history',
    domains: ['upwork.com'],
    files: /\.(csv|json)$/i,
  },
  peopleperhour: {
    url: 'https://www.peopleperhour.com/',
    domains: ['peopleperhour.com'],
    files: /\.(json|csv)$/i,
  },
  naukri: {
    url: 'https://www.naukri.com/',
    domains: ['naukri.com'],
    files: /\.json$/i,
  },
  topcv: {
    url: 'https://www.topcv.vn/',
    domains: ['topcv.vn'],
    files: /\.json$/i,
  },
  vietnamworks: {
    url: 'https://www.vietnamworks.com/',
    domains: ['vietnamworks.com'],
    files: /\.json$/i,
  },
};

/** Recipe metadata safe to send to the SPA (no functions / RegExps). */
export const describeRecipes = () =>
  Object.fromEntries(
    Object.entries(autoImportRecipes).map(([id, recipe]) => [
      id,
      {
        url: recipe.url,
        domains: recipe.domains,
        canCapture: Boolean(recipe.scrape),
      },
    ])
  );
