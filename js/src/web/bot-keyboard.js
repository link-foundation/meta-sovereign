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
  // A login button (R-Y201): pressing it asks Telegram first.
  KeyboardButtonUrlAuth: 'login',
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
  // A button asking for a chat or a person (R-Y208).
  KeyboardButtonRequestPeer: 'peer',
  InputKeyboardButtonRequestPeer: 'peer',
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

// What a kind of button carries besides its words.
const EXTRAS = {
  callback: (raw) => ({
    data: raw.data?.bytes ?? null,
    password: Boolean(raw.requiresPassword),
  }),
  url: (raw) => ({ url: text(raw.url) }),
  // A login button also names itself to Telegram by its id (R-Y201).
  login: (raw) => ({ url: text(raw.url), buttonId: Number(raw.buttonId) }),
  // A reply keyboard's simple web app may send data back (R-Y168).
  app: (raw) => ({
    url: text(raw.url),
    simple: raw.className === 'KeyboardButtonSimpleWebView',
  }),
  switch: (raw) => ({
    query: String(raw.query ?? ''),
    samePeer: Boolean(raw.samePeer),
  }),
  copy: (raw) => ({ copy: String(raw.copyText ?? '') }),
  profile: (raw) => ({ user: text(raw.userId) }),
  // How many may be picked (at least one), and what the bot wants to know.
  peer: (raw) => ({
    buttonId: Number(raw.buttonId),
    peerType: peerTypeOf(raw.peerType),
    max: Math.max(1, Number(raw.maxQuantity) || 1),
    details: {
      name: raw.nameRequested === true,
      username: raw.usernameRequested === true,
      photo: raw.photoRequested === true,
    },
  }),
};

const PEER_KINDS = {
  RequestPeerTypeUser: 'user',
  RequestPeerTypeChat: 'chat',
  RequestPeerTypeBroadcast: 'broadcast',
};

// The rights a bot asks for: the names of those set.
const rightsOf = (rights) =>
  rights
    ? Object.keys(rights).filter(
        (key) => rights[key] === true && key !== 'flags'
      )
    : undefined;

// A boolean the bot set (true or false); undefined when it did not.
const flagOf = (value) => (typeof value === 'boolean' ? value : undefined);

/**
 * What a request-peer button asks for (R-Y208): `{ kind: 'user' | 'chat'
 * | 'broadcast', bot?, premium?, creator?, hasUsername?, forum?,
 * userAdminRights?, botAdminRights? }`, only the constraints it gave; null
 * when the type is not one the app knows.
 */
export const peerTypeOf = (type) => {
  const kind = PEER_KINDS[type?.className];
  if (!kind) {
    return null;
  }
  const out = { kind };
  for (const key of ['bot', 'premium', 'hasUsername', 'forum']) {
    if (flagOf(type[key]) !== undefined) {
      out[key] = type[key];
    }
  }
  for (const key of ['creator', 'botParticipant']) {
    if (type[key] === true) {
      out[key] = true;
    }
  }
  for (const key of ['userAdminRights', 'botAdminRights']) {
    const rights = rightsOf(type[key]);
    if (rights) {
      out[key] = rights;
    }
  }
  return out;
};

// Layer 232 (R-Y220) names what a button does in a `type` of its own
// (`keyboardInlineButton`, and `keyboardButton` with a `buttonType…`).
// The type's class → the button class older messages stored.
const TYPES = {
  InlineButtonTypeUrl: 'KeyboardButtonUrl',
  InlineButtonTypeUrlAuth: 'KeyboardButtonUrlAuth',
  InputInlineButtonTypeUrlAuth: 'InputKeyboardButtonUrlAuth',
  InlineButtonTypeWebView: 'KeyboardButtonWebView',
  InlineButtonTypeCallback: 'KeyboardButtonCallback',
  InlineButtonTypeGame: 'KeyboardButtonGame',
  InlineButtonTypeBuy: 'KeyboardButtonBuy',
  InlineButtonTypeSwitchInline: 'KeyboardButtonSwitchInline',
  InlineButtonTypeUserProfile: 'KeyboardButtonUserProfile',
  InputInlineButtonTypeUserProfile: 'InputKeyboardButtonUserProfile',
  InlineButtonTypeCopy: 'KeyboardButtonCopy',
  ButtonTypeDefault: 'KeyboardButton',
  ButtonTypeRequestPhone: 'KeyboardButtonRequestPhone',
  ButtonTypeRequestGeoLocation: 'KeyboardButtonRequestGeoLocation',
  ButtonTypeRequestPoll: 'KeyboardButtonRequestPoll',
  ButtonTypeRequestPeer: 'KeyboardButtonRequestPeer',
  InputButtonTypeRequestPeer: 'InputKeyboardButtonRequestPeer',
  ButtonTypeSimpleWebView: 'KeyboardButtonSimpleWebView',
};

/**
 * A button as the older classes described it: a layer-232 button
 * (`{ text, style, type }`) takes its class and fields from its type;
 * an older one is returned as it is. A type the app does not know gives
 * `{ className: 'KeyboardButtonUnknown' }`, which `buttonOf` drops.
 */
export const legacyButton = (raw) => {
  if (!raw?.type?.className) {
    return raw;
  }
  const { type, ...rest } = raw;
  return {
    ...type,
    ...rest,
    className: TYPES[type.className] ?? 'KeyboardButtonUnknown',
  };
};

/** One stored button as `{ kind, text, ... }`; null when unknown. */
export const buttonOf = (stored) => {
  const raw = legacyButton(stored);
  const kind = KINDS[raw?.className];
  if (!kind) {
    return null;
  }
  return {
    kind,
    text: String(raw.text ?? ''),
    tone: toneOf(raw.style),
    ...EXTRAS[kind]?.(raw),
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
