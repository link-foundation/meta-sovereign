// A bot's buttons, read from what Telegram stored with its message
// (R-Y110), as Telegram's apps show them (learned, never copied): the
// buttons under a message (an inline keyboard), and the keyboard a bot
// puts in place of the phone's, under the message box (a reply
// keyboard) until it takes it away.

// Telegram's button classes → what a press does here.
const KINDS = {
  KeyboardButton: 'text',
  KeyboardButtonCallback: 'callback',
  KeyboardButtonUrl: 'url',
  KeyboardButtonUrlAuth: 'url',
  KeyboardButtonSwitchInline: 'switch',
  KeyboardButtonCopy: 'copy',
  KeyboardButtonUserProfile: 'profile',
  KeyboardButtonGame: 'game',
  KeyboardButtonWebView: 'app',
  KeyboardButtonSimpleWebView: 'app',
  KeyboardButtonBuy: 'buy',
  KeyboardButtonRequestPhone: 'request',
  KeyboardButtonRequestGeoLocation: 'request',
  KeyboardButtonRequestPoll: 'request',
  KeyboardButtonRequestPeer: 'request',
  InputKeyboardButtonRequestPeer: 'request',
  InputKeyboardButtonUrlAuth: 'url',
  InputKeyboardButtonUserProfile: 'profile',
};

// A button's colour, where the bot gave one.
const toneOf = (style) => {
  if (style?.bgDanger) {
    return 'danger';
  }
  if (style?.bgSuccess) {
    return 'success';
  }
  return style?.bgPrimary ? 'primary' : null;
};

const text = (value) =>
  value === null || value === undefined ? null : String(value);

/** One stored button as `{ kind, text, … }`; null when unknown. */
export const buttonOf = (raw) => {
  const kind = KINDS[raw?.className];
  if (!kind) {
    return null;
  }
  return {
    kind,
    text: String(raw.text ?? ''),
    tone: toneOf(raw.style),
    ...(kind === 'callback'
      ? {
          data: raw.data?.bytes ?? null,
          password: Boolean(raw.requiresPassword),
        }
      : {}),
    ...(kind === 'url' || kind === 'app' ? { url: text(raw.url) } : {}),
    // A reply keyboard's simple web app may send data back (R-Y168).
    ...(kind === 'app'
      ? { simple: raw.className === 'KeyboardButtonSimpleWebView' }
      : {}),
    ...(kind === 'switch'
      ? { query: String(raw.query ?? ''), samePeer: Boolean(raw.samePeer) }
      : {}),
    ...(kind === 'copy' ? { copy: String(raw.copyText ?? '') } : {}),
    ...(kind === 'profile' ? { user: text(raw.userId) } : {}),
  };
};

const rowsOf = (markup) =>
  (markup?.rows ?? [])
    .map((row) => (row?.buttons ?? []).map(buttonOf).filter(Boolean))
    .filter((row) => row.length > 0);

const markupOf = (message) => message?.raw?.replyMarkup ?? null;

/** The rows of buttons under `message`; null when it has none. */
export const inlineKeyboardOf = (message) => {
  const markup = markupOf(message);
  if (markup?.className !== 'ReplyInlineMarkup' || message.pending) {
    return null;
  }
  const rows = rowsOf(markup);
  return rows.length > 0 ? rows : null;
};

// What a bot's message does to the keyboard under the box: shows one,
// takes it away, or nothing.
const KEYBOARD_MARKUPS = new Set([
  'ReplyKeyboardMarkup',
  'ReplyKeyboardHide',
  'ReplyKeyboardForceReply',
]);

// A keyboard meant for some only (`selective`) in a group: for who the
// message answers, when that is us.
const forMe = (message, markup, { personal, mine }) =>
  personal || !markup.selective || Boolean(mine?.(message.replyTo));

// The newest message of a bot that shows, takes away or asks for a
// reply under the message box, with what it says; null when none did.
const latestOf = (messages, options) => {
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i -= 1) {
    const message = messages[i];
    const markup = markupOf(message);
    if (
      KEYBOARD_MARKUPS.has(markup?.className) &&
      message.sender !== 'me' &&
      !message.pending &&
      forMe(message, markup, options)
    ) {
      return { message, markup };
    }
  }
  return null;
};

/**
 * The keyboard a bot put under the message box of a chat whose
 * `messages` are given oldest first: the newest message that shows or
 * takes one away decides. `{ message, rows, resize, singleUse,
 * placeholder }`, or null. `personal`: a one-to-one chat; `mine(ref)`:
 * whether the message a reply answers is ours.
 */
export const replyKeyboardOf = (messages, options = {}) => {
  const latest = latestOf(messages, options);
  if (latest?.markup.className !== 'ReplyKeyboardMarkup') {
    return null;
  }
  const { message, markup } = latest;
  const rows = rowsOf(markup);
  return rows.length > 0
    ? {
        message,
        rows,
        resize: Boolean(markup.resize),
        singleUse: Boolean(markup.singleUse),
        placeholder: text(markup.placeholder),
      }
    : null;
};

/**
 * What the bot asked of the box: `{ placeholder, reply }` — the words it
 * shows, and the message to answer when the bot asked for an answer
 * (Telegram's "force reply").
 */
export const botAskOf = (messages, options = {}) => {
  const latest = latestOf(messages, options);
  return {
    placeholder: text(latest?.markup.placeholder),
    reply:
      latest?.markup.className === 'ReplyKeyboardForceReply'
        ? latest.message
        : null,
  };
};
