// The newer text entities (R-Y221; learned, never copied): a formatted date
// ("tomorrow at 5 PM", written in the viewer's locale from its flags), a
// bank card number (copied on click), and the diff marks of an edited
// text (inserted, deleted, replaced). Pure helpers; message-text.js draws.

/** The entity classes of this file, by the kind the text tree gives them. */
export const EXTRA_KINDS = {
  MessageEntityBankCard: 'bankcard',
  MessageEntityFormattedDate: 'date',
  MessageEntityDiffInsert: 'diff-insert',
  MessageEntityDiffDelete: 'diff-delete',
  MessageEntityDiffReplace: 'diff-replace',
};

// The seconds → the largest unit that fits, for "in 3 hours" / "2 days ago".
const RELATIVE = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

const relativeText = (seconds, now, locale) => {
  const diff = seconds - Math.floor(now / 1000);
  const [unit, size] =
    RELATIVE.find(([, s]) => Math.abs(diff) >= s) ?? RELATIVE.at(-1);
  return new Intl.RelativeTimeFormat(locale || undefined, {
    numeric: 'auto',
  }).format(Math.trunc(diff / size), unit);
};

// The Intl options a date entity's flags ask for.
const optionsOf = (e) => ({
  ...(e.dayOfWeek ? { weekday: 'long' } : {}),
  ...(e.longDate ? { year: 'numeric', month: 'long', day: 'numeric' } : {}),
  ...(e.shortDate && !e.longDate ? { month: 'short', day: 'numeric' } : {}),
  ...(e.shortTime || e.longTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  ...(e.longTime ? { second: '2-digit' } : {}),
});

/**
 * A formatted-date entity's text: `e` has `date` (seconds) and the flags
 * `relative`, `shortTime`, `longTime`, `shortDate`, `longDate`,
 * `dayOfWeek`. Empty when it cannot be worded (the message's own text
 * stays then).
 */
export const formattedDateText = (e, locale, now = Date.now()) => {
  const seconds = Number(e?.date);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }
  try {
    if (e.relative) {
      return relativeText(seconds, now, locale);
    }
    const options = optionsOf(e);
    return Object.keys(options).length > 0
      ? new Intl.DateTimeFormat(locale || undefined, options).format(
          new Date(seconds * 1000)
        )
      : '';
  } catch {
    return '';
  }
};

/** The copy of an entity's fields the text tree keeps for these kinds. */
export const extraFields = (e) => ({
  date: Number(e?.date) || 0,
  relative: Boolean(e?.relative),
  shortTime: Boolean(e?.shortTime),
  longTime: Boolean(e?.longTime),
  shortDate: Boolean(e?.shortDate),
  longDate: Boolean(e?.longDate),
  dayOfWeek: Boolean(e?.dayOfWeek),
  oldText: typeof e?.oldText === 'string' ? e.oldText : '',
});
