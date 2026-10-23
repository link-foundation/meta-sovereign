// The pure parts of the bot and mini-app extras (R-Y194; learned, never
// copied): the Apps list of the search, a prepared message's chooser, and
// a collectible's card. Nothing here touches the page.

const fold = (text) => String(text ?? '').toLocaleLowerCase();

/** The apps whose name or username holds `query` (all when it is empty). */
export const filterApps = (apps = [], query = '') => {
  const q = fold(query).trim().replace(/^@/, '');
  return q
    ? apps.filter(
        (a) => fold(a.name).includes(q) || fold(a.username).includes(q)
      )
    : apps;
};

/** The list with `next` page after it, each bot once. */
export const mergeApps = (list = [], page = []) => {
  const seen = new Set(list.map((a) => a.chat));
  return [...list, ...page.filter((a) => !seen.has(a.chat))];
};

/** What opening an app's chat asks of the app. */
export const appTarget = (app) => ({
  source: 'telegram',
  chat: app.chat,
  name: app.name,
  kind: 'user',
});

/** The request that launches an app's main mini app; null without one. */
export const mainAppRequest = (app) =>
  app?.mainApp && /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(app.username ?? '')
    ? { kind: 'main', username: app.username, chat: app.chat, name: app.name }
    : null;

/**
 * Whether a prepared message may go to `chat`, by the kinds Telegram
 * allowed (`users`, `bots`, `groups`, `channels`, `same-bot`): a private
 * chat is a person or a bot (the page cannot tell which, so either word
 * lets it), the bot's own chat is `same-bot`, a group `groups`, a
 * broadcast channel `channels`.
 */
export const peerAllowed = (types = [], chat, bot) => {
  if (!chat || chat.source !== 'telegram') {
    return false;
  }
  if (chat.kind === 'private') {
    return (
      (String(chat.chat) === String(bot) && types.includes('same-bot')) ||
      types.includes('users') ||
      types.includes('bots')
    );
  }
  return types.includes(chat.kind === 'channel' ? 'channels' : 'groups');
};

/** The chats a prepared message may go to, in the list's order. */
export const shareChats = (chats = [], types = [], bot = '') =>
  chats.filter((c) => !c.archived && peerAllowed(types, c, bot));

/** The answer to the app: what `prepared_message_failed` says. */
export const failureWord = (code) =>
  ({ expired: 'MESSAGE_EXPIRED', 'no-bot': 'BOT_INVALID' })[code] ??
  'UNKNOWN_ERROR';

// ----------------------------------------------------------- collectible

/** An address to open from the card: http(s) only; else null. */
export const learnUrl = (value) => {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
};

// The digits after the point a fiat currency has, from the platform.
const digitsOf = (currency) => {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
};

/** A fiat amount in the smallest units, as money ("$12.50"). */
export const fiatText = (amount, currency, locale) => {
  const value = Number(amount) / 10 ** digitsOf(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
};

const CRYPTO_DIGITS = { TON: 9 };

/** A crypto amount in the smallest units ("12.5 TON"). */
export const cryptoText = (amount, currency, locale) => {
  const value = Number(amount) / 10 ** (CRYPTO_DIGITS[currency] ?? 9);
  return `${value.toLocaleString(locale, { maximumFractionDigits: 9 })} ${currency}`;
};

/** What `kind`'s card is about, as it is written (@name, +888…). */
export const collectibleLabel = (kind, value) =>
  kind === 'username' ? `@${value}` : String(value);

/** The username or phone value Telegram's info marks collectible. */
export const collectibleItems = (info) => [
  ...(info?.collectible?.usernames ?? []).map((value) => ({
    kind: 'username',
    value,
  })),
  ...(info?.collectible?.phone
    ? [{ kind: 'phone', value: info.collectible.phone }]
    : []),
];
