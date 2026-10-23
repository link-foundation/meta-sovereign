// Which new messages notify, from Telegram's notification settings
// (R-Y157; learned, never copied). Telegram keeps a setting for private
// chats, groups and channels, and a chat may differ from it (an
// exception): muted, unmuted or only with its preview changed. A chat
// that is muted never notifies; one in a scope that is off notifies only
// when it is an exception that is unmuted; the text is hidden when the
// chat's preview (its own, else the scope's) is off. Pure functions, and a
// small store the page's lists and Settings share.

/** The scope Telegram files a chat under. */
export const scopeOf = (chat) => {
  if (chat?.kind === 'channel') {
    return 'broadcasts';
  }
  return chat?.kind === 'group' ? 'chats' : 'users';
};

export const NO_RULES = Object.freeze({
  scopes: Object.freeze({}),
  exceptions: Object.freeze(new Map()),
});

/** The rules from the server's `notify-settings` answer. */
export const rulesFrom = (answer) =>
  answer?.ok
    ? {
        scopes: { ...answer.scopes },
        exceptions: new Map(
          (answer.exceptions ?? []).map((e) => [String(e.chat), e])
        ),
      }
    : NO_RULES;

const exceptionOf = (chat, rules) => rules.exceptions.get(String(chat?.chat));

/** Whether a chat's new message may raise a notification. */
export const shouldNotify = (chat, rules = NO_RULES, now = Date.now()) => {
  if (chat?.muted) {
    return false;
  }
  if (chat?.source !== 'telegram') {
    return true;
  }
  const exception = exceptionOf(chat, rules);
  if (exception?.state === 'unmuted') {
    return true;
  }
  if (
    exception?.state === 'muted' &&
    Number(exception.muteUntil) * 1000 > now
  ) {
    return false;
  }
  return rules.scopes[scopeOf(chat)]?.on !== false;
};

/** Whether the text may show: the chat's own preview, else the scope's. */
export const showPreview = (chat, rules = NO_RULES) => {
  if (chat?.source !== 'telegram') {
    return true;
  }
  const own = exceptionOf(chat, rules)?.previews;
  return typeof own === 'boolean'
    ? own
    : rules.scopes[scopeOf(chat)]?.previews !== false;
};

/** How an exception reads in a list: its key and the time, if any. */
export const exceptionState = (exception) => {
  if (exception.state === 'muted') {
    return exception.forever
      ? { key: 'muted' }
      : { key: 'mutedUntil', until: Number(exception.muteUntil) * 1000 };
  }
  return { key: exception.state === 'unmuted' ? 'unmuted' : 'custom' };
};

/** Rules with one scope's row changed (a new object). */
export const withScope = (rules, scope, row) => ({
  ...rules,
  scopes: { ...rules.scopes, [scope]: { ...rules.scopes[scope], ...row } },
});

/**
 * Rules with one chat's own setting applied: `row` as `notify-chat`
 * answers, `name` and `scope` for its place in the list; an `exception`
 * false takes it out.
 */
export const withChat = (rules, row, { name, scope }) => {
  const exceptions = new Map(rules.exceptions);
  if (row.exception) {
    exceptions.set(String(row.chat), {
      chat: String(row.chat),
      name,
      scope,
      state: row.muteUntil > 0 || row.forever ? 'muted' : 'unmuted',
      muteUntil: row.muteUntil,
      forever: Boolean(row.forever),
      previews: row.previews ?? null,
    });
  } else {
    exceptions.delete(String(row.chat));
  }
  return { ...rules, exceptions };
};

// --- The store ------------------------------------------------------------

let current = NO_RULES;
const listeners = new Set();

export const getNotifyRules = () => current;

export const setNotifyRules = (next) => {
  current = next;
  for (const listener of listeners) {
    listener(current);
  }
};

export const subscribeNotifyRules = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Asks the server for the rules and keeps them; failures keep the old. */
export const loadNotifyRules = async (api) => {
  if (typeof api?.telegramNotifySettings !== 'function') {
    return current;
  }
  const answer = await api.telegramNotifySettings().catch(() => null);
  if (answer?.ok) {
    setNotifyRules(rulesFrom(answer));
  }
  return current;
};
