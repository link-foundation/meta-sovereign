/**
 * A chat opened far back, as Telegram's apps open it on a date picked
 * in the calendar (R-Y106; learned, never copied): the first message on
 * or after that moment, with a page around it, read from Telegram and
 * stored; then the pages after it, one at a time, as the user scrolls
 * down toward the newest. Nothing between there and the newest is read
 * first.
 *
 * What is read joins the chat's stored stretch (./telegram-history.js)
 * once it reaches it, so the rest comes from the store.
 */

import { coverSlice, historyLink, historyLinkId } from './telegram-history.js';

const iso = (ms) => new Date(ms).toISOString();

const real = (list) =>
  [...(list ?? [])].filter(
    (m) => m && m.id !== undefined && m.className !== 'MessageEmpty'
  );

// Whether the stored stretch holds message `id` and what follows it.
const covers = (record, id) =>
  record?.oldest !== null &&
  record?.oldest !== undefined &&
  Number(id) >= Number(record.oldest) &&
  Number(id) <= Number(record.newest);

/**
 * `env` is the account's; `tools` the page reader's; `whereIs(env,
 * tools, client, chat, priority)` → `{ peer, dialog }`.
 */
export const createHistoryJump = (env, tools, { whereIs }) => {
  const { store, connection, queue, now } = env;

  const open = async (target, priority) => {
    const creds = await tools.credentials();
    if (creds?.kind !== 'user') {
      return null;
    }
    const { client } = await connection.open(creds);
    const { peer, dialog } = await whereIs(
      env,
      tools,
      client,
      target,
      priority
    );
    return { client, peer, dialog };
  };

  // Store what was read; join the stretch when it reaches it.
  const keep = async (target, dialog, list) => {
    const written = await tools.writeChanged(
      store,
      tools.toLinks(dialog, list)
    );
    const record = await store.get(historyLinkId(target));
    const cover = coverSlice(record, {
      ids: list.map((m) => m.id),
      limit: list.length,
      mode: 'newer',
      at: iso(now()),
    });
    if (cover !== record) {
      await store.put(historyLink(target, cover));
    }
    return written;
  };

  /**
   * The first message at or after `date` (unix seconds) and the messages
   * around it, stored: `{ ok, id, newest }` — `id` null when nothing is
   * that late (the chat's newest is where to go), `newest` when the
   * page reaches the chat's newest message.
   */
  const historyAt = async ({ chat, date, limit = 50, priority = 'view' }) => {
    const target = String(chat ?? '');
    const at = target && date > 0 ? await open(target, priority) : null;
    if (!at) {
      return { ok: false, supported: false };
    }
    const half = Math.max(1, Math.floor(limit / 2));
    const read = (side, options) =>
      queue.run(`at:${target}:${date}:${side}`, priority, () =>
        at.client.getMessages(at.peer, options)
      );
    const later = real(
      await read('after', { offsetDate: date, reverse: true, limit: half })
    );
    const earlier = real(
      await read('before', { offsetDate: date, limit: limit - half })
    );
    const written = await keep(target, at.dialog, [...earlier, ...later]);
    return {
      ok: true,
      id: later.length ? Number(later[0].id) : null,
      newest: later.length < half,
      written,
    };
  };

  /**
   * The page after message `after`, stored (from Telegram unless the
   * stretch already holds it): `{ written, cached, newest }`.
   */
  const newer = async ({ chat, after, limit = 50, priority = 'view' }) => {
    const target = String(chat ?? '');
    const record = await store.get(historyLinkId(target));
    if (covers(record, after)) {
      return { written: 0, cached: true, newest: false };
    }
    const at = await open(target, priority);
    if (!at) {
      return { written: 0 };
    }
    const list = real(
      await queue.run(`newer:${target}:${after}:${limit}`, priority, () =>
        at.client.getMessages(at.peer, {
          offsetId: Number(after),
          reverse: true,
          limit,
        })
      )
    );
    const written = await keep(target, at.dialog, list);
    return { written, cached: false, newest: list.length < limit };
  };

  return { historyAt, newer };
};
