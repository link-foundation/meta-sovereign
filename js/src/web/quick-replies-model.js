// Quick replies and Telegram Business messages, the page's side (R-Y179;
// learned, never copied): the shortcuts as the "/" list of a private chat's
// box shows them, the rules a shortcut's name follows, and the pure parts of
// the greeting and away message forms.

import { useEffect, useState } from 'react';

/** A shortcut's name: letters, digits and underscores, 1 to 32 of them. */
export const NAME = /^[\p{L}\p{N}_]{1,32}$/u;

/** The shortcut Telegram uses for the greeting and for the away message. */
export const SPECIAL = Object.freeze({ greeting: 'hello', away: 'away' });

/** Days of silence before the greeting is sent again, as Telegram has them. */
export const DAYS = Object.freeze([7, 14, 21, 28]);

/** The key of the words for a refusal's code. */
export const errorText = (t, code) => {
  const key = `quick.err.${code}`;
  const text = t(key);
  return text === key ? t('quick.err.failed') : text;
};

/** `null` when the name suits a shortcut, else the code of the problem. */
export const nameProblem = (name) => {
  const value = String(name ?? '').trim();
  if (value === '') {
    return 'bad-name';
  }
  return NAME.test(value) ? null : 'bad-name';
};

/** The "/" list's items for the shortcuts (the bot commands' shape). */
export const quickCommands = (replies = []) =>
  replies
    .filter((r) => r.count > 0)
    .map((r) => ({
      command: r.name,
      description: r.preview || '',
      bot: 'quick',
      botName: '',
      username: null,
      quick: true,
      shortcutId: r.id,
    }));

const CHANGED = 'meta-sovereign:quick-replies-changed';

// The shortcuts, asked once for a while; settings that change them forget.
const KEEP_MS = 5 * 60_000;
let kept = null;

/** Forgets the shortcuts asked for (after the Quick Replies editor). */
export const forgetQuickReplies = () => {
  kept = null;
  globalThis.dispatchEvent?.(new globalThis.Event(CHANGED));
};

const loadQuickReplies = (api, now = Date.now()) => {
  if (!kept || now - kept.at > KEEP_MS) {
    const at = now;
    kept = {
      at,
      promise: Promise.resolve(api.telegramQuickReplies()).then(
        (a) => (a?.ok ? (a.replies ?? []) : []),
        () => []
      ),
    };
  }
  return kept.promise;
};

/** Whether a chat is a person's: where Telegram Business may reply. */
export const isPerson = (chat, info) =>
  chat?.source === 'telegram' &&
  /^\d{1,20}$/.test(String(chat.chat ?? '')) &&
  !info?.bot &&
  info?.kind !== 'channel';

/** The user's shortcuts as list items, for a chat of a person. */
export const useQuickReplies = (api, chat, info) => {
  const wanted =
    isPerson(chat, info) && typeof api?.telegramQuickReplies === 'function';
  const [items, setItems] = useState([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    globalThis.addEventListener?.(CHANGED, again);
    return () => globalThis.removeEventListener?.(CHANGED, again);
  }, []);
  useEffect(() => {
    if (!wanted) {
      setItems([]);
      return undefined;
    }
    let live = true;
    loadQuickReplies(api).then((replies) => {
      if (live) {
        setItems(quickCommands(replies));
      }
    });
    return () => {
      live = false;
    };
  }, [api, wanted, chat?.chat, tick]);
  return wanted ? items : [];
};

// ---- the greeting and away message forms ----

export const NO_ONE = Object.freeze({
  existingChats: false,
  newChats: false,
  contacts: false,
  nonContacts: false,
  excludeSelected: true,
  users: [],
});

/** Every 1-on-1 chat, none excluded: Telegram's default. */
export const EVERYONE = Object.freeze({
  ...NO_ONE,
  existingChats: true,
  newChats: true,
  contacts: true,
  nonContacts: true,
});

export const CATEGORIES = Object.freeze([
  'existingChats',
  'newChats',
  'contacts',
  'nonContacts',
]);

/** The recipients with one category switched. */
export const withCategory = (r, key, on) => ({ ...r, [key]: on });

/** The recipients with a person added or removed. */
export const withPerson = (r, id) => ({
  ...r,
  users: r.users.includes(id)
    ? r.users.filter((u) => u !== id)
    : [...r.users, id],
});

/** Whether the recipients reach anyone: a category, or chosen people. */
export const reachesAnyone = (r) =>
  CATEGORIES.some((k) => r[k]) || (!r.excludeSelected && r.users.length > 0);

const pad = (n) => String(n).padStart(2, '0');

/** Seconds → the value of a `datetime-local` box, in local time. */
export const toLocalInput = (seconds) => {
  const d = new Date(seconds * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** A `datetime-local` value → seconds, or null when it is not a date. */
export const fromLocalInput = (value) => {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
};

/** The schedule the form means, or the code of what is wrong with it. */
export const scheduleOf = (kind, startInput, endInput) => {
  if (kind !== 'custom') {
    return { schedule: { kind } };
  }
  const start = fromLocalInput(startInput);
  const end = fromLocalInput(endInput);
  return start === null || end === null || end <= start
    ? { problem: 'bad-range' }
    : { schedule: { kind, start, end } };
};

/**
 * The form of the greeting or the away message from what Telegram has
 * (`null`: off); `now` (seconds) starts a custom range.
 */
export const formOf = (kind, saved, shortcuts, now) => {
  const special = shortcuts.find((s) => s.name === SPECIAL[kind]);
  const base = {
    enabled: Boolean(saved),
    shortcutId: String(saved?.shortcutId ?? special?.id ?? ''),
    recipients: saved?.recipients ?? EVERYONE,
  };
  if (kind === 'greeting') {
    return { ...base, noActivityDays: saved?.noActivityDays ?? 7 };
  }
  const schedule = saved?.schedule ?? { kind: 'always' };
  return {
    ...base,
    offlineOnly: Boolean(saved?.offlineOnly),
    scheduleKind: schedule.kind,
    start: toLocalInput(schedule.start ?? now),
    end: toLocalInput(schedule.end ?? now + 7 * 86_400),
  };
};

/** What the form says to save: `{ body }`, or `{ problem }` as a code. */
export const requestOf = (kind, form) => {
  if (!form.enabled) {
    return { body: { enabled: false } };
  }
  if (!form.shortcutId) {
    return { problem: 'no-shortcut' };
  }
  if (!reachesAnyone(form.recipients)) {
    return { problem: 'no-recipients' };
  }
  const common = {
    enabled: true,
    shortcutId: Number(form.shortcutId),
    recipients: form.recipients,
  };
  if (kind === 'greeting') {
    return { body: { ...common, noActivityDays: form.noActivityDays } };
  }
  const { schedule, problem } = scheduleOf(
    form.scheduleKind,
    form.start,
    form.end
  );
  return problem
    ? { problem }
    : { body: { ...common, offlineOnly: form.offlineOnly, schedule } };
};
