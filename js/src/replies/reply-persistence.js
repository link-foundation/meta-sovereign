// Reply counts are a derived whole-model snapshot, not editable CRDT records.
import { snapshotVersion } from '../storage/browser-snapshot.js';

export const MODEL_ID = 'reply-model';
const conflict = () =>
  Object.assign(
    new Error('The saved reply model changed; refresh its source.'),
    {
      code: 'REPLY_CACHE_CONFLICT',
    }
  );

const position = (version) => {
  const match = /^([a-z0-9]+)\.(\d+)$/u.exec(String(version));
  return match && Number.isSafeInteger(Number(match[2]))
    ? [match[1], Number(match[2])]
    : null;
};

// An epoch is opaque. Only offsets inside the same build can be ordered.
export const compareReplyVersions = (a, b) => {
  const left = position(a);
  const right = position(b);
  return left && right && left[0] === right[0] ? left[1] - right[1] : null;
};

export const captureReplyRequest = async (persistence, local) => {
  const current = await persistence.read().catch(() => null);
  const differentBuild =
    current?.model &&
    compareReplyVersions(local, current.model.version) === null;
  return {
    local,
    since: differentBuild ? '' : local,
    authority: current?.expected,
  };
};

export const replyModel = (snapshot) => {
  if (snapshot === null || snapshot === undefined) {
    return null;
  }
  const links = snapshot.links;
  const header = links?.find?.((link) => link?.id === MODEL_ID);
  if (
    !Array.isArray(links) ||
    !position(header?.version) ||
    !Array.isArray(header.self) ||
    !header.self.every((id) => typeof id === 'string') ||
    !Number.isFinite(header.windowMs) ||
    header.windowMs <= 0 ||
    links.some((link) => !link || typeof link.id !== 'string') ||
    new Set(links.map((link) => link.id)).size !== links.length
  ) {
    throw conflict();
  }
  return { ...header, links: links.filter((link) => link.id !== MODEL_ID) };
};

export const sameReplySettings = (a, b) =>
  a.windowMs === b.windowMs &&
  JSON.stringify(a.self.slice().sort()) ===
    JSON.stringify(b.self.slice().sort());

export const createReplyPersistence = (driver) => {
  const read = async () => {
    const raw = (await driver?.load()) ?? null;
    return { model: replyModel(raw), expected: snapshotVersion(raw) };
  };
  return {
    read,
    async save(links, authority) {
      const candidate = replyModel({ links });
      // Legacy custom drivers still run in the cache's single save lane.
      if (!driver?.revisioned) {
        await driver?.save({ links });
        return { model: candidate, expected: snapshotVersion({ links }) };
      }
      for (let attempt = 0; ; attempt += 1) {
        const current = await read();
        const order = compareReplyVersions(
          candidate.version,
          current.model?.version
        );
        if (
          current.model &&
          order !== null &&
          sameReplySettings(candidate, current.model)
        ) {
          if (order <= 0) {
            return current;
          }
        } else if (current.expected !== authority) {
          throw conflict();
        }
        try {
          const expected = await driver.save(
            { links },
            { expected: current.expected }
          );
          return { model: candidate, expected };
        } catch (error) {
          if (
            attempt >= 7 ||
            !['STORE_SNAPSHOT_CHANGED', 'STORE_SNAPSHOT_BUSY'].includes(
              error?.code
            )
          ) {
            throw error;
          }
          await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
        }
      }
    },
  };
};
