/**
 * Send and receive messages through the official web UIs (issue #31,
 * PR #34).
 *
 * The API adapters (`./vk.js`, `./telegram.js`, `./whatsapp.js`) are
 * the first choice, but they are not always usable: a VK community
 * token cannot write to a personal friend, a Telegram bot cannot open a
 * conversation, WhatsApp Cloud needs a business number, and any token
 * can expire. In every one of those cases the person can still send the
 * message by hand in vk.com, web.telegram.org or web.whatsapp.com — so
 * this module does exactly that, through browser-commander, in the
 * persistent profile where the user signed in once.
 *
 * - `WEB_UIS` is the declarative per-network table: chat URL, composer,
 *   send control, message list and logged-in markers.
 * - `createBrowserSender()` drives those pages: `send`, `setTyping`,
 *   `readRecent` and `close`, with one lazily opened page per network.
 * - `createFallbackSender()` tries the API first and falls back to the
 *   browser when the API throws (or is not configured).
 * - `createDefaultSender()` wires the source adapters and the browser
 *   together for automations and the chat composer.
 *
 * The browser session itself comes from `../cv/browser.js`, so the
 * optional-dependency story (`browser-commander` + `playwright`,
 * `BrowserUnavailableError`, persistent profiles) is shared with CV runs.
 */

/* global document -- `extractMessages` runs in the page */

import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { defaultProfileDir, openBrowserSession } from '../cv/browser.js';
import { selectorCandidates } from '../cv/runner.js';
import { createAdapterSender } from '../crm/reengage.js';

/** VK peer ids of group chats start here (`messages.send` peer_id). */
const VK_CHAT_PEER_OFFSET = 2000000000;

const isNumericId = (value) => /^-?\d+$/.test(String(value));

/**
 * Official web UIs, one entry per network.
 *
 * The selectors are BEST-EFFORT: they were chosen from the current
 * public markup of each web client and cannot be verified here without
 * a signed-in account. Every web client ships new markup from time to
 * time, so the table is plain data — pass a patched copy as
 * `createBrowserSender({ platforms })` to override any entry without
 * touching this file. Each selector field may be a comma-separated
 * candidate list; the first candidate that matches wins.
 *
 * Entry fields:
 * - `chatUrl(target, { text })` URL of the conversation;
 * - `target({ chat, to })` which draft field addresses the chat;
 * - `loginUrl` where the user signs in once (persistent profile);
 * - `loggedIn` / `loggedOut` markers telling the two states apart;
 * - `composer` the message input (contenteditable in all three);
 * - `prefill` the chat URL already puts the text into the composer;
 * - `send` `{ selector, key }`: click the button, else press the key;
 * - `messages` how to read the visible history (see `extractMessages`).
 */
export const WEB_UIS = Object.freeze({
  vk: Object.freeze({
    id: 'vk',
    name: 'VK',
    loginUrl: 'https://vk.com/',
    chatUrl: (target) => {
      const raw = String(target).replace(/^@/, '');
      const sel =
        isNumericId(raw) && Number(raw) >= VK_CHAT_PEER_OFFSET
          ? `c${Number(raw) - VK_CHAT_PEER_OFFSET}`
          : raw;
      return `https://vk.com/im?sel=${encodeURIComponent(sel)}`;
    },
    target: ({ chat, to }) => chat ?? to,
    loggedIn: '#l_msg, .im-page, .ConvoMain, [data-testid="im_page"]',
    loggedOut: '#index_login, .VkIdForm, form[action*="login"]',
    composer:
      '.ComposerInput__input[contenteditable="true"], .im_editable[contenteditable="true"], div[contenteditable="true"][role="textbox"]',
    prefill: false,
    send: {
      selector:
        '.ConvoComposer__sendButton--submit, .im-send-btn_send, button[aria-label="Отправить"], button[aria-label="Send"]',
      key: 'Enter',
    },
    messages: {
      item: '.ConvoHistory__messageBlock, .im-mess[data-msgid]',
      idAttribute: 'data-msgid',
      sender: '.PeerTitle__title, .ConvoMessageAuthor, .im-mess-stack--lnk',
      body: '.MessageText, .im-mess--text',
      time: 'time, .ConvoMessageInfo__time, .im-mess--lnk',
      timeAttribute: 'datetime',
      outgoing: '.ConvoMessage--out, .im-mess_out',
    },
  }),
  telegram: Object.freeze({
    id: 'telegram',
    name: 'Telegram',
    loginUrl: 'https://web.telegram.org/k/',
    // Web K routes `#@username` to a public username and `#<id>` to a
    // numeric peer id (negative for groups and channels).
    chatUrl: (target) => {
      const raw = String(target).trim();
      const peer = isNumericId(raw) ? raw : `@${raw.replace(/^@/, '')}`;
      return `https://web.telegram.org/k/#${peer}`;
    },
    target: ({ chat, to }) => chat ?? to,
    loggedIn: '#column-left .chatlist, .chatlist-container, .chat-input',
    loggedOut: '.page-sign, .page-signQR, .auth-pages',
    composer:
      '.input-message-input[contenteditable="true"], div[contenteditable="true"].input-message-input',
    prefill: false,
    send: { selector: 'button.btn-send', key: 'Enter' },
    messages: {
      item: '.bubble[data-mid]',
      idAttribute: 'data-mid',
      sender: '.peer-title, .name',
      body: '.translatable-message, .message',
      time: '.time-inner, .time',
      timeAttribute: 'title',
      timestampAttribute: 'data-timestamp',
      outgoing: '.is-out',
    },
  }),
  whatsapp: Object.freeze({
    id: 'whatsapp',
    name: 'WhatsApp',
    loginUrl: 'https://web.whatsapp.com/',
    // The click-to-chat URL opens the chat and pre-fills the composer.
    chatUrl: (target, { text = '' } = {}) => {
      const phone = String(target).replace(/\D/g, '');
      const query = text ? `&text=${encodeURIComponent(text)}` : '';
      return `https://web.whatsapp.com/send?phone=${phone}${query}`;
    },
    target: ({ chat, to }) => to ?? chat,
    loggedIn: '#pane-side, div[aria-label="Chat list"], #main footer',
    loggedOut: 'canvas[aria-label="Scan me!"], div[data-ref], .landing-main',
    composer:
      'footer div[contenteditable="true"][role="textbox"], div[contenteditable="true"][data-tab="10"]',
    prefill: true,
    send: {
      selector:
        'button[aria-label="Send"], button[aria-label="Отправить"], span[data-icon="send"]',
      key: 'Enter',
    },
    messages: {
      item: '#main div[data-id]',
      idAttribute: 'data-id',
      sender: '[data-pre-plain-text]',
      senderAttribute: 'data-pre-plain-text',
      body: 'span.selectable-text, .copyable-text span',
      time: '[data-pre-plain-text]',
      timeAttribute: 'data-pre-plain-text',
      outgoing: '.message-out, [data-id^="true_"]',
    },
  }),
});

/** The user has to sign in once in the persistent browser profile. */
export class BrowserLoginRequiredError extends Error {
  constructor({ source, loginUrl, profileDir }) {
    super(
      `${source}: not signed in to the web UI — open ${loginUrl} in the browser profile ${profileDir} (headless: false) and log in once; the session is kept for later runs`
    );
    this.name = 'BrowserLoginRequiredError';
    this.code = 'login-required';
    this.source = source;
    this.loginUrl = loginUrl;
    this.profileDir = profileDir;
  }
}

/** Both the API and the browser failed; `causes` holds both errors. */
export class SendFallbackError extends AggregateError {
  constructor(causes, message) {
    super(causes, message);
    this.name = 'SendFallbackError';
    this.code = 'send-failed';
    this.causes = causes;
  }
}

const codedError = (message, code) =>
  Object.assign(new Error(message), { code });

/** Errors that must never trigger a browser retry. */
export const NO_FALLBACK_CODES = Object.freeze(['safe-mode', 'bad-draft']);

// An adapter marks an error `fallback: false` when the message may
// already be out (a connected account): sending it again through the
// browser could post it twice.
const defaultShouldFallback = (error) =>
  error?.fallback !== false && !NO_FALLBACK_CODES.includes(error?.code);

/**
 * Page-side extractor for the visible message history. It runs inside
 * the browser through `commander.evaluate`, so it must stay
 * self-contained (no closures over module scope).
 */
export const extractMessages = (spec) => {
  const squash = (value) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  const pick = (node, selector, attribute) => {
    if (!selector) {
      return null;
    }
    const found = node.querySelector(selector);
    if (!found) {
      return null;
    }
    return attribute
      ? (found.getAttribute(attribute) ?? null)
      : (found.textContent ?? '');
  };
  const rows = Array.from(document.querySelectorAll(spec.item));
  return rows.slice(-spec.limit).map((node) => ({
    id: spec.idAttribute ? node.getAttribute(spec.idAttribute) : null,
    sender: squash(pick(node, spec.sender, spec.senderAttribute)),
    body: String(pick(node, spec.body) ?? '').trim(),
    time: squash(pick(node, spec.time, spec.timeAttribute)) || null,
    timestamp: spec.timestampAttribute
      ? node.getAttribute(spec.timestampAttribute)
      : null,
    outgoing: spec.outgoing ? Boolean(node.matches?.(spec.outgoing)) : false,
  }));
};

/** WhatsApp's `data-pre-plain-text`: "[10:15, 11/10/2026] Anna: ". */
const PRE_PLAIN = /^\[([^\]]+)\]\s*(.*?):?\s*$/;

const toIso = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (isNumericId(value)) {
    const n = Number(value);
    return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
};

const shortHash = (value) =>
  createHash('sha1').update(value).digest('hex').slice(0, 12);

/** Turn an extracted row into a message link like the API adapters'. */
const toMessageLink = (source, chat, row) => {
  const pre = PRE_PLAIN.exec(row.sender ?? '');
  const sender = (pre ? pre[2] : row.sender) || (row.outgoing ? 'me' : '');
  const timestamp =
    toIso(row.timestamp) ?? toIso(pre ? pre[1] : row.time) ?? null;
  const key = row.id || shortHash(`${sender}\n${row.body}\n${row.time ?? ''}`);
  return {
    id: `msg:${source}:${chat}:${key}`,
    tokens: ['message', source, chat],
    source,
    chat,
    sender: sender || null,
    body: row.body,
    timestamp,
    outgoing: Boolean(row.outgoing),
    via: 'browser',
  };
};

/** First candidate of a comma-separated selector list that matches. */
const firstMatch = async (commander, selector) => {
  for (const candidate of selectorCandidates(selector)) {
    if ((await commander.count({ selector: candidate })) > 0) {
      return candidate;
    }
  }
  return null;
};

/** Poll until one of `want` matches; give up early when `stop` matches. */
const waitForAny = async (
  commander,
  want,
  { stop = null, timeoutMs, pollMs }
) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await firstMatch(commander, want);
    if (found) {
      return found;
    }
    if (
      (stop && (await firstMatch(commander, stop))) ||
      Date.now() >= deadline
    ) {
      return null;
    }
    await sleep(pollMs);
  }
};

/**
 * Real key events, so the other side sees "typing…". Line breaks are
 * Shift+Enter: a bare Enter would send the message half-written.
 */
const typeLines = async (commander, text, delayMs) => {
  for (const [index, line] of text.split('\n').entries()) {
    if (index > 0) {
      await commander.pressKey({ key: 'Shift+Enter' });
    }
    if (line && delayMs > 0) {
      for (const char of line) {
        await commander.typeText({ text: char });
        await sleep(delayMs);
      }
    } else if (line) {
      await commander.typeText({ text: line });
    }
  }
};

/** Click the send button when it is there, otherwise press the key. */
const pressSend = async (ui, commander) => {
  const button = ui.send?.selector
    ? await firstMatch(commander, ui.send.selector)
    : null;
  if (button) {
    await commander.clickButton({ selector: button, scrollIntoView: true });
    return;
  }
  await commander.pressKey({ key: ui.send?.key ?? 'Enter' });
};

/**
 * One page per network, opened on first use and then reused. One page
 * also means one action at a time: concurrent calls for a network queue
 * up instead of interleaving keystrokes in the same composer.
 */
const createSessionPool = ({ open, log }) => {
  const sessions = new Map();
  const queues = new Map();
  return {
    get(source) {
      if (!sessions.has(source)) {
        const opening = Promise.resolve(open({ source })).then((session) => ({
          session,
          commander: session.commander,
          url: null,
        }));
        // A failed launch is forgotten so the next call tries again.
        opening.catch(() => {
          if (sessions.get(source) === opening) {
            sessions.delete(source);
          }
        });
        sessions.set(source, opening);
      }
      return sessions.get(source);
    },
    queue(source, fn) {
      const run = (queues.get(source) ?? Promise.resolve()).then(fn);
      queues.set(
        source,
        run.catch(() => {})
      );
      return run;
    },
    sources: () => [...sessions.keys()],
    async closeAll() {
      const pending = [...sessions.values()];
      sessions.clear();
      queues.clear();
      const results = await Promise.allSettled(
        pending.map(async (opening) => (await opening).session.close?.())
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        log(`[browser] ${failed} session(s) failed to close`);
      }
    },
  };
};

/**
 * Drive the official web UIs through browser-commander.
 *
 * @param {object} [options]
 * @param {(args: {source: string}) => Promise<{commander: object, close: Function}>} [options.openSession]
 *   session factory; defaults to `openBrowserSession` from
 *   `../cv/browser.js` with the per-network persistent profile
 * @param {object} [options.platforms] web UI table, default `WEB_UIS`
 * @param {number} [options.typingDelayMs] pause between characters;
 *   0 types each line in one burst (still real key events)
 * @param {'type'|'fill'} [options.input] type key by key (shows
 *   "typing…") or fill the composer in one go
 * @param {number} [options.loginTimeoutMs] how long to wait for the
 *   logged-in marker after navigation
 * @param {number} [options.pollMs] polling interval while waiting
 * @param {boolean} [options.headless] for the default session factory
 * @param {(source: string) => string} [options.profileDirFor] persistent
 *   profile per network (default `~/.meta-sovereign/browser-profiles/<id>`)
 * @param {Function} [options.log] progress messages
 * @param {() => Date} [options.clock]
 */
export const createBrowserSender = ({
  openSession = null,
  platforms = WEB_UIS,
  typingDelayMs = 0,
  input = 'type',
  loginTimeoutMs = 20000,
  pollMs = 250,
  headless = true,
  profileDirFor = defaultProfileDir,
  log = () => {},
  clock = () => new Date(),
} = {}) => {
  const open =
    openSession ??
    (({ source }) =>
      openBrowserSession({
        platform: source,
        headless,
        profileDir: profileDirFor(source),
      }));
  const pool = createSessionPool({ open, log });

  const uiFor = (source) => {
    const ui = platforms[source];
    if (!ui) {
      throw codedError(
        `${source}: no web UI is known; known: ${Object.keys(platforms).join(', ')}`,
        'unsupported-source'
      );
    }
    return ui;
  };

  const waitFor = (commander, want, extra = {}) =>
    waitForAny(commander, want, {
      timeoutMs: loginTimeoutMs,
      pollMs,
      ...extra,
    });

  /** Navigate to the chat (if not already there) and check the login. */
  const openChat = async (source, target, { text = '' } = {}) => {
    const ui = uiFor(source);
    if (target === null || target === undefined || target === '') {
      throw codedError(
        `${source}: a chat or recipient is required`,
        'bad-draft'
      );
    }
    const state = await pool.get(source);
    const prefill = ui.prefill && text ? text : '';
    const url = ui.chatUrl(target, { text: prefill });
    // A pre-filled URL is reloaded every time: the reload is what puts
    // the text back into the composer.
    if (state.url !== url || prefill) {
      log(`[browser:${source}] open ${url}`);
      await state.commander.goto({ url, waitUntil: 'domcontentloaded' });
      state.url = url;
    }
    if (
      !(await waitFor(state.commander, ui.loggedIn, { stop: ui.loggedOut }))
    ) {
      state.url = null;
      throw new BrowserLoginRequiredError({
        source,
        loginUrl: ui.loginUrl,
        profileDir: profileDirFor(source),
      });
    }
    return state.commander;
  };

  /** Run `fn(commander)` with the chat open, in the network's queue. */
  const inChat = (source, target, options, fn) =>
    pool.queue(source, async () => fn(await openChat(source, target, options)));

  const focusComposer = async (source, ui, commander) => {
    const composer = await waitFor(commander, ui.composer);
    if (!composer) {
      throw codedError(
        `${source}: message composer not found (selector ${ui.composer}); update WEB_UIS.${source}.composer`,
        'composer-missing'
      );
    }
    await commander.clickButton({ selector: composer, scrollIntoView: true });
    return composer;
  };

  return {
    platforms,

    /** Type and send one message in the network's web UI. */
    async send({ source, chat, to, text } = {}) {
      const body = String(text ?? '');
      if (!body.trim()) {
        throw codedError(`${source}: message text is required`, 'bad-draft');
      }
      const ui = uiFor(source);
      const target = ui.target({ chat, to });
      await inChat(source, target, { text: body }, async (commander) => {
        const composer = await focusComposer(source, ui, commander);
        // A pre-filled chat URL already put the text into the composer.
        if (!ui.prefill && input === 'fill') {
          await commander.fillTextArea({
            selector: composer,
            text: body,
            checkEmpty: false,
            simulateTyping: true,
          });
        } else if (!ui.prefill) {
          await typeLines(commander, body, typingDelayMs);
        }
        await pressSend(ui, commander);
      });
      log(`[browser:${source}] sent to ${target}`);
      return {
        via: 'browser',
        source,
        chat: String(target),
        sentAt: clock().toISOString(),
      };
    },

    /** Emit the "typing…" status: type a character and erase it. */
    async setTyping({ source, chat, to } = {}) {
      const ui = uiFor(source);
      await inChat(source, ui.target({ chat, to }), {}, async (commander) => {
        await focusComposer(source, ui, commander);
        await commander.typeText({ text: '.' });
        await commander.pressKey({ key: 'Backspace' });
      });
      return { via: 'browser', source, typing: true };
    },

    /** Read the visible history of a chat as message links. */
    async readRecent({ source, chat, to, limit = 20 } = {}) {
      const ui = uiFor(source);
      const target = ui.target({ chat, to });
      const rows = await inChat(source, target, {}, (commander) =>
        commander.evaluate({
          fn: extractMessages,
          args: [{ ...ui.messages, limit }],
        })
      );
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => row && String(row.body ?? '').length > 0)
        .map((row) => toMessageLink(source, String(target), row));
    },

    /** Networks with an open page. */
    openSources: pool.sources,

    /** Close every page that was opened. */
    close: pool.closeAll,
  };
};

const annotate = (result, via, extra = {}) =>
  result !== null && typeof result === 'object' && !Array.isArray(result)
    ? { ...result, ...extra, via }
    : { result: result ?? null, ...extra, via };

/**
 * API first, browser second.
 *
 * @param {object} options
 * @param {(draft: object) => Promise<any>} [options.apiSend]
 * @param {(draft: object) => Promise<any>} [options.browserSend]
 * @param {(error: Error) => boolean} [options.shouldFallback] default:
 *   every error except `safe-mode` and `bad-draft`
 * @param {Function} [options.log]
 * @returns {(draft: object) => Promise<object>} result with `via`
 */
export const createFallbackSender =
  ({
    apiSend = null,
    browserSend = null,
    log = () => {},
    shouldFallback = defaultShouldFallback,
  } = {}) =>
  async (draft) => {
    let apiError = null;
    if (typeof apiSend === 'function') {
      try {
        return annotate(await apiSend(draft), 'api');
      } catch (error) {
        if (!shouldFallback(error) || typeof browserSend !== 'function') {
          throw error;
        }
        apiError = error;
        log(
          `[send:${draft?.source}] API failed (${error.message}); trying the web UI`
        );
      }
    }
    if (typeof browserSend !== 'function') {
      throw codedError(
        `${draft?.source}: no API or browser sender is configured`,
        'no-sender'
      );
    }
    try {
      const result = await browserSend(draft);
      return annotate(
        result,
        'browser',
        apiError ? { apiError: apiError.message } : {}
      );
    } catch (error) {
      if (!apiError) {
        throw error;
      }
      throw new SendFallbackError(
        [apiError, error],
        `${draft?.source}: sending failed through the API (${apiError.message}) and the web UI (${error.message})`
      );
    }
  };

/**
 * The sender automations and the chat composer use: the source adapter's
 * `live.post` first, the official web UI second.
 *
 * @param {object} [options]
 * @param {(source: string) => object} [options.getSource] adapter lookup;
 *   without it every draft goes through the browser
 * @param {object} [options.options] per-source `live.post` options
 * @param {object} [options.browser] a `createBrowserSender()` instance,
 *   or options for one (created lazily on the first fallback)
 * @param {Function} [options.log]
 * @returns {Function & {close: Function}} `(draft) => result`
 */
export const createDefaultSender = ({
  getSource = null,
  options = {},
  browser = {},
  log = () => {},
} = {}) => {
  let browserSender = typeof browser?.send === 'function' ? browser : null;
  const browserFor = () => {
    browserSender ??= createBrowserSender({ log, ...browser });
    return browserSender;
  };
  const send = createFallbackSender({
    apiSend: getSource ? createAdapterSender({ getSource, options }) : null,
    browserSend: (draft) =>
      browserFor().send({
        source: draft.source,
        chat: draft.chat,
        to: draft.contact ?? draft.to,
        text: draft.text,
      }),
    log,
  });
  return Object.assign(send, {
    close: async () => browserSender?.close(),
  });
};
