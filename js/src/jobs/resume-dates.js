const months = [
  ['jan', 'январ'],
  ['feb', 'феврал'],
  ['mar', 'март'],
  ['apr', 'апрел'],
  ['may', 'мая'],
  ['jun', 'июн'],
  ['jul', 'июл'],
  ['aug', 'август'],
  ['sep', 'сентябр'],
  ['oct', 'октябр'],
  ['nov', 'ноябр'],
  ['dec', 'декабр'],
];
const monthIndex = (name) =>
  months.findIndex((names) =>
    names.some((prefix) => name.toLowerCase().startsWith(prefix))
  );
const dayMs = 86400000;

/** Local visible HH dates are hints; native epoch timestamps take precedence. */
export const resumeDate = (text, now = new Date()) => {
  if (typeof text !== 'string' || text.length > 200) {
    return null;
  }
  const value = text.replace(/\s+/gu, ' ');
  const clock = value.match(/(\d{1,2}):(\d{2})/u);
  const hour = Number(clock?.[1] ?? 0);
  const minute = Number(clock?.[2] ?? 0);
  if (hour > 23 || minute > 59) {
    return null;
  }
  const relative = relativeDate(value, now, hour, minute);
  return relative === undefined
    ? absoluteDate(value, now, hour, minute)
    : relative;
};

const relativeDate = (value, now, hour, minute) => {
  if (/только что|just now/iu.test(value)) {
    return now.getTime();
  }
  const ago = value.match(
    /(\d+|an?)?\s*(минут|час|minute|hour)\p{L}*\s+(?:назад|ago)/iu
  );
  if (ago) {
    const amount = /^\d+$/u.test(ago[1] ?? '') ? Number(ago[1]) : 1;
    const unit = /час|hour/iu.test(ago[2]) ? 3600000 : 60000;
    return amount <= 10000 ? now.getTime() - amount * unit : null;
  }
  const relative = value.match(/сегодня|вчера|today|yesterday/iu);
  if (relative) {
    const date = new Date(now);
    date.setHours(hour, minute, 0, 0);
    if (/вчера|yesterday/iu.test(relative[0])) {
      date.setDate(date.getDate() - 1);
    }
    return date.getTime();
  }
  return undefined;
};

const absoluteDate = (value, now, hour, minute) => {
  const numeric = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/u);
  const dayFirst = value.match(/(\d{1,2})\s+([a-zа-яё]+)(?:\s+(\d{4}))?/iu);
  const monthFirst = value.match(/([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?/iu);
  const named =
    dayFirst && monthIndex(dayFirst[2]) >= 0
      ? [dayFirst[1], monthIndex(dayFirst[2]) + 1, dayFirst[3]]
      : monthFirst && monthIndex(monthFirst[1]) >= 0
        ? [monthFirst[2], monthIndex(monthFirst[1]) + 1, monthFirst[3]]
        : null;
  const parts = numeric?.slice(1) ?? named;
  if (!parts) {
    return null;
  }
  const [day, month, year] = parts.map((part) => (part ? Number(part) : null));
  const date = new Date(
    year ?? now.getFullYear(),
    month - 1,
    day,
    hour,
    minute
  );
  if (date.getDate() !== day || date.getMonth() !== month - 1) {
    return null;
  }
  if (!year && date.getTime() > now.getTime() + dayMs) {
    date.setFullYear(date.getFullYear() - 1);
  }
  return date.getDate() === day && date.getMonth() === month - 1
    ? date.getTime()
    : null;
};
