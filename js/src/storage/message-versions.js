// Observed message content is append-only, independently of the service's
// retention. Save both sides before replacing a message; never scan the archive
// on a write or create versions for read receipts, counters or tombstones.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isTombstone } from './soft-delete.js';

export const VERSION_PREFIX = 'message-version:';
export const isMessageVersion = (link) => link?.kind === 'message-version';
const isMessage = (link) => String(link?.id ?? '').startsWith('msg:');
const wrapped = new WeakMap();
const volatile = new Set([
  'fileReference',
  'accessHash',
  'dcId',
  'views',
  'forwards',
  'reactions',
  'results',
]);
const stable = (value) => {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => !volatile.has(key))
        .map((key) => [key, stable(value[key])])
    );
  }
  return typeof value === 'bigint' ? String(value) : value;
};
const content = (link) =>
  JSON.stringify(
    stable({
      body: link.body ?? link.raw?.message ?? '',
      subject: link.subject ?? '',
      entities: link.raw?.entities ?? link.entities ?? [],
      media: link.raw?.media ?? link.media ?? link.attachments ?? null,
      buttons: link.raw?.replyMarkup ?? link.replyMarkup ?? null,
    })
  );
const hash = (value) => createHash('sha256').update(value).digest('hex');
const editedAt = (link) => {
  const value =
    typeof link.edited === 'string' ? link.edited : link.raw?.editDate;
  if (!value) {
    return null;
  }
  const number = Number(value);
  const ms = Number.isFinite(number)
    ? number * (number < 1e12 ? 1000 : 1)
    : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
const snapshot = (link) => {
  const {
    versionHead: _head,
    versionCount: _count,
    versionPartial: _partial,
    ...rest
  } = link;
  return globalThis.structuredClone(rest);
};
const version = (link, parent, at) => {
  const id = `${VERSION_PREFIX}${encodeURIComponent(link.id)}:${hash(JSON.stringify([content(link), editedAt(link), parent]))}`;
  return {
    id,
    tokens: ['message-version'],
    kind: 'message-version',
    messageId: link.id,
    ...(link.source !== undefined ? { source: link.source } : {}),
    ...(link.chat !== undefined ? { chat: link.chat } : {}),
    capturedAt: at,
    editedAt: editedAt(link),
    previous: parent ?? null,
    snapshot: snapshot(link),
  };
};
const changeKind = (before, link) => {
  if (!before) {
    return null;
  }
  if (content(before) !== content(link)) {
    return 'edit';
  }
  return isTombstone(link) && !isTombstone(before) ? 'delete' : null;
};

const versionWriter = (inner, { now, preserve, indexVersions }) => {
  const guard = async (link) => {
    if (!String(link?.id).startsWith(VERSION_PREFIX)) {
      return;
    }
    const before = await inner.get(link.id);
    const immutable = (record) => {
      const { assets: _assets, ...rest } = record;
      return rest;
    };
    if (before && !isDeepStrictEqual(immutable(before), immutable(link))) {
      throw Object.assign(new Error('saved message versions are immutable'), {
        code: 'VERSION_IMMUTABLE',
      });
    }
  };
  const changed = async (
    before,
    link,
    { pending, history, after },
    deleted = false
  ) => {
    const at = now();
    const old = version(before, null, at);
    const parent = before.versionHead ?? old.id;
    const partial = before.versionHead
      ? Boolean(before.versionPartial)
      : Boolean(before.edited || before.raw?.editDate);
    const current = version(link, parent, at);
    const previous = pending.get(parent) ?? (await inner.get(parent)) ?? old;
    const finish = await preserve(previous, {
      before,
      next: link,
      cached: !pending.has(link.id),
    });
    if (typeof finish === 'function') {
      after.push(finish);
    }
    history.push(previous);
    pending.set(previous.id, previous);
    if (deleted) {
      return {
        ...link,
        versionHead: parent,
        versionCount: before.versionCount ?? 1,
        versionPartial: partial,
      };
    }
    if (!pending.has(current.id) && !(await inner.get(current.id))) {
      history.push(current);
      pending.set(current.id, current);
    }
    return {
      ...link,
      versionHead: current.id,
      versionCount: (before.versionCount ?? 1) + 1,
      versionPartial: partial,
    };
  };
  return async (links, single = false) => {
    const pending = new Map();
    const writes = [];
    const history = [];
    const after = [];
    const output = [];
    for (const link of links) {
      if (!isMessage(link)) {
        await guard(link);
        writes.push(link);
        output.push(link);
        continue;
      }
      const before = pending.get(link.id) ?? (await inner.get(link.id));
      let next = link;
      if (before?.versionHead) {
        next = {
          ...link,
          versionHead: before.versionHead,
          versionCount: before.versionCount,
          versionPartial: Boolean(before.versionPartial),
        };
      }
      const kind = changeKind(before, link);
      if (kind) {
        next = await changed(
          before,
          link,
          { pending, history, after },
          kind === 'delete'
        );
      }
      pending.set(link.id, next);
      writes.push(next);
      output.push(next);
    }
    const write = async (records, one = false) => {
      if (!records.length) {
        return;
      }
      if (one && records.length === 1) {
        await inner.put(records[0]);
      } else if (inner.putMany) {
        await inner.putMany(records);
      } else {
        for (const record of records) {
          await inner.put(record);
        }
      }
    };
    await write(history);
    indexVersions(history);
    for (const finish of after) {
      await finish();
    }
    await write(writes, single);
    indexVersions(writes);
    return output;
  };
};

/** Wrap any store; the returned store retains lifecycle/handoff methods. */
export const withMessageVersions = (
  inner,
  {
    now = () => new Date().toISOString(),
    preserve = async () => {},
    purgeMedia = async () => {},
  } = {}
) => {
  if (wrapped.has(inner)) {
    return wrapped.get(inner);
  }
  let tail = Promise.resolve();
  let versionIds = null;
  const indexVersions = (records) => {
    if (!versionIds) {
      return;
    }
    for (const record of records.filter(isMessageVersion)) {
      const ids = versionIds.get(record.messageId) ?? new Set();
      ids.add(record.id);
      versionIds.set(record.messageId, ids);
    }
  };
  const versionsFor = async (id) => {
    if (!versionIds) {
      versionIds = new Map();
      if (inner.scan) {
        await inner.scan(isMessageVersion, 500, indexVersions);
      } else {
        indexVersions(await inner.query(isMessageVersion));
      }
    }
    return (
      await Promise.all(
        [...(versionIds.get(id) ?? [])].map((key) => inner.get(key))
      )
    ).filter(Boolean);
  };
  const enqueue = (run) => {
    const result = tail.then(run);
    tail = result.catch(() => {});
    return result;
  };
  const prepare = versionWriter(inner, { now, preserve, indexVersions });
  const result = Object.defineProperties(
    {},
    Object.getOwnPropertyDescriptors(inner)
  );
  result.put = (link) =>
    isMessage(link) || String(link?.id).startsWith(VERSION_PREFIX)
      ? enqueue(async () => (await prepare([link], true))[0])
      : inner.put(link);
  result.putMany = (links) =>
    links.some(
      (link) => isMessage(link) || String(link?.id).startsWith(VERSION_PREFIX)
    )
      ? enqueue(() => prepare(links))
      : inner.putMany
        ? inner.putMany(links)
        : Promise.all(links.map((link) => inner.put(link)));
  result.delete = (id) =>
    !String(id).startsWith('msg:')
      ? inner.delete(id)
      : enqueue(async () => {
          // Hard deletion is already an explicitly confirmed local operation. Its
          // saved text must be erased too, rather than left as hidden revision links.
          const records = await versionsFor(id);
          for (const record of records) {
            await inner.delete(record.id);
          }
          const removed = await inner.delete(id);
          versionIds.delete(id);
          await purgeMedia(records, inner);
          return removed;
        });
  for (const name of [
    'flush',
    'flushLog',
    'prepareHandoff',
    'releaseForHandoff',
    'close',
  ]) {
    if (typeof inner[name] === 'function') {
      result[name] = async (...args) => {
        await tail;
        return inner[name](...args);
      };
    }
  }
  wrapped.set(inner, result);
  wrapped.set(result, result);
  return result;
};

/** Read the immutable chain by ID, without querying unrelated messages. */
export const messageVersions = async (
  store,
  id,
  { before, limit = 50 } = {}
) => {
  const message = await store.get(id);
  const versions = [];
  const seen = new Set();
  let cursor = before ?? message?.versionHead;
  while (cursor && !seen.has(cursor) && versions.length < limit) {
    seen.add(cursor);
    const record = await store.get(cursor);
    if (!isMessageVersion(record) || record.messageId !== id) {
      break;
    }
    versions.push(record);
    cursor = record.previous;
  }
  if (!versions.length && message && !before) {
    versions.push({
      messageId: id,
      capturedAt: null,
      editedAt: editedAt(message),
      snapshot: snapshot(message),
    });
  }
  return {
    message,
    versions,
    next: cursor && !seen.has(cursor) ? cursor : null,
  };
};
