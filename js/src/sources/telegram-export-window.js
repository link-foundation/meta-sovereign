// Locate an active conversation with bounded pages, retaining only peer/ID
// ranges. Export reuses the existing chronological/media pipeline afterwards.
import { rawMessage } from './telegram-history.js';

const unix = (value) =>
  typeof value === 'string'
    ? Math.floor(Date.parse(value) / 1000) || 0
    : Number(value) || 0;

export const exportTrace = (r, event, details) => {
  if (r.job.options.debug) {
    r.env.log?.({
      level: 'debug',
      event: `telegram_export_${event}`,
      ...details,
    });
  }
};

export const migratedChat = (messages) => {
  const action = messages.find(
    (m) => m.action?.className === 'MessageActionChannelMigrateFrom'
  )?.action;
  const id = String(action?.chatId?.value ?? action?.chatId ?? '');
  return /^[1-9]\d{0,19}$/.test(id) ? `-${id}` : null;
};

const extendRange = (messages, range, clock, gap) => {
  for (const message of messages) {
    const at = unix(message.date);
    if (clock.previous !== null && at && clock.previous - at >= gap) {
      return false;
    }
    if (at) {
      clock.previous = at;
    }
    range.maxId ??= Number(message.id);
    range.minId = Number(message.id);
    range.count += 1;
  }
  return true;
};

const descending = (page, cursor) =>
  (page.messages ?? [])
    .map(rawMessage)
    .filter(
      (m) =>
        m &&
        m.className !== 'MessageEmpty' &&
        Number(m.id) > 0 &&
        (!cursor || Number(m.id) < cursor)
    )
    .sort((a, b) => Number(b.id) - Number(a.id));

export const activeHistoryRanges = async (
  r,
  { pageOf, absorb, stopping, migrationOf }
) => {
  const ranges = [];
  const visited = new Set();
  let chat = r.job.chat;
  const clock = { previous: null };
  const gap = r.job.options.gapHours * 3600;
  r.job.phase = 'locating';
  while (chat && !stopping(r)) {
    if (visited.has(chat) || visited.size >= 8) {
      throw new Error('history-migration-cycle');
    }
    visited.add(chat);
    let cursor = 0;
    let migration = null;
    const range = { chat, minId: null, maxId: null, count: 0 };
    for (let n = 1; !stopping(r); n += 1) {
      const page = await pageOf(chat, cursor, n);
      absorb(page, r.ctx);
      const messages = descending(page, cursor);
      migration = migratedChat(messages) ?? migration;
      if (!messages.length) {
        break;
      }
      if (!extendRange(messages, range, clock, gap)) {
        if (range.count) {
          ranges.push(range);
        }
        exportTrace(r, 'boundary', {
          ...range,
          gapHours: r.job.options.gapHours,
        });
        return ranges.reverse();
      }
      cursor = Number(messages.at(-1).id);
      await r.publish();
    }
    if (range.count) {
      ranges.push(range);
    }
    exportTrace(r, 'range', range);
    chat = migration ?? (await migrationOf(chat));
  }
  return ranges.reverse();
};
