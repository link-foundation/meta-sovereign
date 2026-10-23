/**
 * Send safety settings shared by every automated send (R-Z3): quiet
 * hours, the opt-out list (chats and people never to message) and the
 * reasons a chat cannot be written to at all (blocked us, we left it,
 * a deleted account, a bot, a channel).
 *
 * One `automation-settings:global` link holds them; the page edits it
 * (`GET`/`PUT /api/automations/settings`). Pure and free of Node modules
 * so the browser can plan with it too.
 */

export const SETTINGS_ID = 'automation-settings:global';

/** Night hours in the user's own timezone: nothing is sent by itself. */
export const DEFAULT_QUIET_HOURS = Object.freeze({
  enabled: true,
  from: '22:00',
  to: '08:00',
});

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MAX_OPT_OUT = 5000;

const minutesOf = (text) => {
  const match = HHMM.exec(String(text ?? ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const validZone = (zone) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const text = (value) => String(value ?? '').trim();

const entryOf = (input) => {
  const [source, chat, contact] = [
    input?.source,
    input?.chat,
    input?.contact,
  ].map(text);
  if (!source || (!chat && !contact)) {
    return null;
  }
  return {
    source,
    ...(chat ? { chat } : {}),
    ...(contact ? { contact } : {}),
    note: text(input?.note).slice(0, 200),
    at: input?.at ?? null,
  };
};

const uniqueEntries = (list) => {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(entryOf)
    .filter((entry) => {
      const key = `${entry?.source}\u0000${entry?.chat ?? ''}\u0000${entry?.contact ?? ''}`;
      if (!entry || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_OPT_OUT);
};

const days = (value) =>
  value === null || value === undefined || value === ''
    ? null
    : Number.isFinite(Number(value))
      ? Math.max(Number(value), 0)
      : null;

const timeOr = (value, fallback) =>
  minutesOf(value) === null ? fallback : value;

/** Fill defaults and drop what is malformed. */
export const normalizeSettings = (input = {}) => {
  const quiet = input?.quietHours ?? {};
  return {
    quietHours: {
      enabled: quiet.enabled !== false,
      from: timeOr(quiet.from, '22:00'),
      to: timeOr(quiet.to, '08:00'),
    },
    timezone:
      typeof input?.timezone === 'string' && validZone(input.timezone)
        ? input.timezone
        : null,
    optOut: uniqueEntries(input?.optOut),
    cooldownDays: days(input?.cooldownDays),
  };
};

export const loadSettings = async (store) =>
  normalizeSettings((await store?.get?.(SETTINGS_ID)) ?? {});

export const saveSettings = async (store, input) => {
  const settings = normalizeSettings(input);
  await store.put({
    id: SETTINGS_ID,
    tokens: ['automation-settings', 'global'],
    ...settings,
    updatedAt: new Date().toISOString(),
  });
  return settings;
};

/** The opt-out entry covering this chat or person, or null. */
export const optOutEntry = (settings, { source, chat, contact } = {}) =>
  (settings?.optOut ?? []).find(
    (entry) =>
      entry.source === String(source) &&
      ((entry.chat !== undefined &&
        chat !== undefined &&
        entry.chat === String(chat)) ||
        (entry.contact !== undefined &&
          contact !== undefined &&
          contact !== null &&
          entry.contact === String(contact)))
  ) ?? null;

// Local hour and minute in `timeZone` (the machine's own by default).
const localMinutes = (ms, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    ...(timeZone ? { timeZone } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const value = (type) => Number(parts.find((p) => p.type === type)?.value);
  return value('hour') * 60 + value('minute');
};

// Whether minute-of-day `at` is inside from..to (which may cross midnight).
const insideWindow = (at, from, to) =>
  from < to ? at >= from && at < to : at >= from || at < to;

/**
 * Milliseconds until the quiet hours end when `now` is inside them, else
 * 0. The window may cross midnight (22:00 to 08:00).
 */
export const quietMsLeft = (now, settings) => {
  const quiet = settings?.quietHours ?? DEFAULT_QUIET_HOURS;
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  if (quiet.enabled === false || from === null || to === null || from === to) {
    return 0;
  }
  const at = localMinutes(Number(now), settings?.timezone ?? undefined);
  return insideWindow(at, from, to)
    ? Math.max(((to - at + 1440) % 1440) * 60_000, 60_000)
    : 0;
};

const flagged = (messages, ...fields) =>
  messages.some((m) => fields.some((field) => m?.[field] === true));

/**
 * Why nothing should be written to a chat, judged from what its stored
 * messages say: a channel, a bot, blocked us, we left it, a deleted
 * account. `null` when it can be written to.
 */
export const unreachableReason = (messages = []) => {
  if (messages.some((m) => m?.chatType === 'channel')) {
    return 'channel';
  }
  if (flagged(messages, 'bot', 'isBot', 'senderBot')) {
    return 'bot';
  }
  if (flagged(messages, 'blocked', 'chatBlocked', 'blockedUs')) {
    return 'blocked';
  }
  if (flagged(messages, 'left', 'chatLeft')) {
    return 'left';
  }
  if (flagged(messages, 'deletedAccount', 'senderDeleted')) {
    return 'deleted-account';
  }
  return null;
};
