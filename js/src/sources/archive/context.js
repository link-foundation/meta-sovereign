/**
 * What an archive importer gets besides the parsed file (R-Z10): the
 * other files of the same archive (to find a message's photo, video…),
 * a sink that copies them into `<store>/media/<network>/<sha256>.<ext>`
 * (owner-only, content-addressed so a second import writes nothing new),
 * and per-import counters so ids stay unique across `message_N.json`.
 */

import { baseName } from './text.js';

// Errors that mean "the disk cannot take this" (R-Z14): never swallowed.
const FATAL = new Set(['ENOSPC', 'EDQUOT', 'EROFS', 'EIO', 'EACCES', 'EPERM']);

export const isFatalWrite = (error) =>
  FATAL.has(error?.code) ||
  error?.code === 'STORE_WRITE_FAILED' ||
  error?.code === 'STORE_FULL';

/**
 * @param {object} options
 * @param {string} options.network   folder name under media/
 * @param {Array} [options.entries]  files of the archive (zip entries)
 * @param {Function|null} [options.save]  `({entry, folder}) => Promise<{path, sha256, size}>`
 *   copies an archive file into media/ (Node only, ./media-store.js); null = not copied
 */
export const createArchiveContext = ({
  network,
  entries = [],
  save = null,
}) => {
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const saved = new Map();
  const counters = new Map();
  const warnings = [];
  let baseIndex = null;
  const byBase = () => {
    if (!baseIndex) {
      baseIndex = new Map();
      for (const entry of entries) {
        const base = baseName(entry.name);
        const list = baseIndex.get(base);
        if (list) {
          list.push(entry);
        } else {
          baseIndex.set(base, [entry]);
        }
      }
    }
    return baseIndex;
  };
  const find = (uri) => {
    const clean = String(uri).replace(/^\.?\//, '');
    if (byName.has(clean)) {
      return byName.get(clean);
    }
    // The archive may sit in a top-level folder (`facebook-name-2026/`).
    const suffix = `/${clean}`;
    return (
      (byBase().get(baseName(clean)) ?? []).find((entry) =>
        entry.name.endsWith(suffix)
      ) ?? null
    );
  };
  return {
    network,
    warnings,
    // Facts one file tells the next (X's account.js names "me").
    state: {},
    /** 0, 1, 2… for the n-th time `key` is seen in this import. */
    ordinal(key) {
      const n = counters.get(key) ?? 0;
      counters.set(key, n + 1);
      return n;
    },
    /** The archive file `uri` names, copied into media/; null if absent. */
    async media(uri, folder = network) {
      const entry = uri ? find(uri) : null;
      if (!entry || !save) {
        return null;
      }
      if (!saved.has(entry.name)) {
        saved.set(entry.name, copyEntry({ entry, save, folder, warnings }));
      }
      return saved.get(entry.name);
    },
  };
};

const copyEntry = async ({ entry, save, folder, warnings }) => {
  try {
    return await save({ entry, folder });
  } catch (error) {
    if (isFatalWrite(error)) {
      throw error;
    }
    warnings.push(`${entry.name}: ${error.message}`);
    return null;
  }
};
