/**
 * Mail attachments kept next to the store (R-Z5).
 *
 * The bytes of an attachment are saved under their SHA-256 in
 * `<store>/media/email/`, so the same file is kept once, and a link names
 * it by that hash (`attachment.file`). A name from the outside is never
 * a path: only a 64-digit hash is accepted, and the resolved path must
 * stay inside the directory. A file above the cap is not kept.
 */

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  renameSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

const HASH = /^[0-9a-f]{64}$/;

export const createAttachmentStore = (dir) => {
  const root = path.resolve(dir);
  const pathOf = (hash) => {
    if (!HASH.test(String(hash ?? ''))) {
      return null;
    }
    const file = path.resolve(root, hash);
    return path.dirname(file) === root ? file : null;
  };
  return {
    dir: root,
    pathOf,
    /** Keep `bytes`; its hash, or null when it is too big to keep. */
    save(bytes) {
      if (!bytes?.length || bytes.length > MAX_ATTACHMENT_BYTES) {
        return null;
      }
      const hash = createHash('sha256').update(bytes).digest('hex');
      const file = pathOf(hash);
      if (!existsSync(file)) {
        mkdirSync(root, { recursive: true, mode: 0o700 });
        const temp = `${file}.${process.pid}.tmp`;
        writeFileSync(temp, bytes, { mode: 0o600 });
        renameSync(temp, file);
      }
      return hash;
    },
    /** The bytes of a kept file, or null. */
    read(hash) {
      const file = pathOf(hash);
      return file && existsSync(file) ? readFileSync(file) : null;
    },
  };
};
