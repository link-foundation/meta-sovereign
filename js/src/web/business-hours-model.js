// Opening hours of a business, as plain data (R-Y180; Telegram Desktop's
// Business hours, learned, never copied). Telegram keeps them as a list of
// `{ start, end }` in minutes from Monday 00:00 in the business's time
// zone; an interval may run past midnight, and past Sunday into Monday
// (`end` up to 8 days). The page edits them as seven days of
// `{ from, to }` (minutes in the day, `to` up to 1440) and converts.
// Everything that depends on the time takes `now`.

export const DAY = 1440;
export const WEEK = 7 * DAY;

/** Seven days (Monday first) of `{ from, to }` for Telegram's `weekly`. */
export const toDays = (weekly = []) => {
  const days = Array.from({ length: 7 }, () => []);
  for (const { start, end } of weekly) {
    let at = start;
    while (at < end) {
      const index = Math.floor(at / DAY);
      const stop = Math.min(end, (index + 1) * DAY);
      days[index % 7].push({ from: at - index * DAY, to: stop - index * DAY });
      at = stop;
    }
  }
  return days.map((ranges) => ranges.sort((a, b) => a.from - b.from));
};

/** Telegram's `weekly` for seven days, touching intervals made one. */
export const toWeekly = (days) => {
  const list = days
    .flatMap((ranges, i) =>
      ranges.map((r) => ({ start: i * DAY + r.from, end: i * DAY + r.to }))
    )
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const item of list) {
    const last = merged.at(-1);
    if (last && last.end >= item.start) {
      last.end = Math.max(last.end, item.end);
    } else {
      merged.push({ ...item });
    }
  }
  // Sunday night into Monday morning is one interval that wraps.
  if (
    merged.length > 1 &&
    merged.at(-1).end === WEEK &&
    merged[0].start === 0
  ) {
    const first = merged.shift();
    merged.at(-1).end = WEEK + first.end;
  }
  return merged;
};

/** Why seven days cannot be saved: a code for words, or null. */
export const daysProblem = (days) => {
  for (const ranges of days) {
    const sorted = [...ranges].sort((a, b) => a.from - b.from);
    for (let i = 0; i < sorted.length; i += 1) {
      const r = sorted[i];
      if (!(r.from >= 0 && r.to <= DAY && r.to > r.from)) {
        return 'hours-invalid';
      }
      if (i > 0 && sorted[i - 1].to > r.from) {
        return 'hours-overlap';
      }
    }
  }
  return null;
};

/** "09:30" as minutes, or null. */
export const parseTime = (value) => {
  const found = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ''));
  const minutes = found ? Number(found[1]) * 60 + Number(found[2]) : null;
  return minutes !== null && Number(found[2]) < 60 && minutes <= DAY
    ? minutes
    : null;
};

const pad = (n) => String(n).padStart(2, '0');

/** Minutes in a day as "09:30" ("24:00" at the end of it). */
export const formatTime = (minutes) =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** A day's ranges as "09:00 – 18:00, 19:00 – 21:00"; '' when closed. */
export const rangesText = (ranges) =>
  ranges.map((r) => `${formatTime(r.from)} – ${formatTime(r.to)}`).join(', ');

/** Whether a day is open the whole day. */
export const allDay = (ranges) =>
  ranges.length === 1 && ranges[0].from === 0 && ranges[0].to === DAY;

/** The browser's own time zone. */
export const myZone = () => {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** A zone's offset from UTC in minutes at `at` (0 for an unknown zone). */
export const offsetMinutes = (zone, at) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(new Date(at));
    const n = (type) => Number(parts.find((p) => p.type === type)?.value);
    const local = Date.UTC(
      n('year'),
      n('month') - 1,
      n('day'),
      n('hour'),
      n('minute'),
      n('second')
    );
    return Math.round((local - Math.floor(at / 1000) * 1000) / 60_000);
  } catch {
    return 0;
  }
};

/** Minutes from Monday 00:00 in `zone` at `at`. */
export const weekMinute = (zone, at) => {
  const local = new Date(at + offsetMinutes(zone, at) * 60_000);
  const day = (local.getUTCDay() + 6) % 7;
  return day * DAY + local.getUTCHours() * 60 + local.getUTCMinutes();
};

/** `weekly` moved by `delta` minutes (their zone to another one). */
export const shiftWeekly = (weekly, delta) =>
  weekly.map(({ start, end }) => {
    const from = (((start + delta) % WEEK) + WEEK) % WEEK;
    return { start: from, end: from + (end - start) };
  });

/**
 * `weekly` as seen in `viewZone` at `now`: the hours of a business in
 * `zone` moved to the viewer's time zone.
 */
export const hoursIn = (weekly, zone, viewZone, now) =>
  zone === viewZone
    ? weekly
    : shiftWeekly(
        weekly,
        offsetMinutes(viewZone, now) - offsetMinutes(zone, now)
      );

/** Whether the business is open at `now` (by their own clock). */
export const isOpen = (weekly, zone, now) => {
  const m = weekMinute(zone, now);
  return weekly.some(
    ({ start, end }) =>
      (start <= m && m < end) ||
      (end > WEEK && start <= m + WEEK && m + WEEK < end)
  );
};

/** The weekday (0 Monday .. 6) it is in `zone` at `now`. */
export const weekday = (zone, now) => Math.floor(weekMinute(zone, now) / DAY);

/** The day names, Monday first, in `locale`. */
export const dayNames = (locale) => {
  let format;
  try {
    format = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      timeZone: 'UTC',
    });
  } catch {
    format = new Intl.DateTimeFormat('en', {
      weekday: 'long',
      timeZone: 'UTC',
    });
  }
  // 1 January 2024 was a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    format.format(new Date(Date.UTC(2024, 0, 1 + i)))
  );
};

/** A zone's label: "(UTC+03:00) Moscow". */
export const zoneLabel = (zone) => {
  const sign = zone.offset < 0 ? '-' : '+';
  const abs = Math.abs(zone.offset);
  return `(UTC${sign}${pad(Math.floor(abs / 3600))}:${pad(Math.floor((abs % 3600) / 60))}) ${zone.name}`;
};
