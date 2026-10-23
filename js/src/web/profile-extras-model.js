// Birthdays and profile colours as pure helpers (R-Y178; learned, never
// copied): a birthday is `{ day, month, year? }`, today's mark and the
// age as Telegram's apps show them, and the colours of a profile card's
// header from the palette Telegram offers (with the seven first ones
// known here, so a card is coloured before the palette arrives).

/** Days in `month` (1..12); February has 29 when the year is unknown. */
export const daysIn = (month, year) => {
  if (month === 2) {
    return year === undefined || year % 4 === 0 ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

/** This year back to 1900, for the year picker. */
export const birthYears = (now = new Date()) =>
  Array.from(
    { length: now.getFullYear() - 1900 + 1 },
    (_, i) => now.getFullYear() - i
  );

/** Whether the birthday is on `now`'s day. */
export const isBirthdayToday = (birthday, now = new Date()) =>
  Boolean(birthday) &&
  birthday.day === now.getDate() &&
  birthday.month === now.getMonth() + 1;

/** The age on `now`, or null when the year is unknown. */
export const ageOf = (birthday, now = new Date()) => {
  if (!birthday?.year) {
    return null;
  }
  const month = now.getMonth() + 1;
  const before =
    month < birthday.month ||
    (month === birthday.month && now.getDate() < birthday.day);
  const age = now.getFullYear() - birthday.year - (before ? 1 : 0);
  return age >= 0 ? age : null;
};

/** "12 March" or "12 March 1990" in the locale. */
export const birthdayDate = (birthday, locale) =>
  new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    ...(birthday.year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(
    new Date(Date.UTC(birthday.year ?? 2000, birthday.month - 1, birthday.day))
  );

/** The month's name in the locale. */
export const monthName = (month, locale) =>
  new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, month - 1, 1))
  );

/** The form's fields (strings) as a birthday, or null when not a date. */
export const birthdayOfForm = ({ day, month, year }) => {
  const d = Number(day);
  const m = Number(month);
  const y = year === '' || year === undefined ? undefined : Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || m < 1 || m > 12) {
    return null;
  }
  if (d < 1 || d > daysIn(m, y)) {
    return null;
  }
  return y === undefined ? { day: d, month: m } : { day: d, month: m, year: y };
};

/** The birthday as the form's fields. */
export const formOfBirthday = (birthday) => ({
  day: birthday ? String(birthday.day) : '',
  month: birthday ? String(birthday.month) : '',
  year: birthday?.year ? String(birthday.year) : '',
});

/** Whether two birthdays (or none) are the same. */
export const sameBirthday = (a, b) =>
  (a?.day ?? 0) === (b?.day ?? 0) &&
  (a?.month ?? 0) === (b?.month ?? 0) &&
  (a?.year ?? 0) === (b?.year ?? 0);

// The seven first profile colours' header gradients (red, orange, violet,
// green, cyan, blue, pink), until Telegram's palette is known.
export const DEFAULT_PROFILE_COLORS = Object.freeze([
  ['#ba5650', '#9c4540'],
  ['#be8230', '#a06a24'],
  ['#9068b8', '#7552a0'],
  ['#5f9e44', '#4a8534'],
  ['#3b9aa0', '#2c8087'],
  ['#4c82b8', '#3a6a9c'],
  ['#b4638c', '#9a4e75'],
]);

/** The colours of colour `id` in the palette (`{ id, colors }` list), or null. */
export const colorsOf = (palette, id) => {
  const found = (palette ?? []).find((option) => option.id === id);
  if (found?.colors?.length > 0) {
    return found.colors;
  }
  return DEFAULT_PROFILE_COLORS[id] ?? null;
};

/** The CSS background of a header with `colors`, or undefined. */
export const gradientOf = (colors) => {
  if (!Array.isArray(colors) || colors.length === 0) {
    return undefined;
  }
  const list = colors.length === 1 ? [colors[0], colors[0]] : colors;
  return `linear-gradient(135deg, ${list.join(', ')})`;
};
