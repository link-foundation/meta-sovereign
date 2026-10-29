// Disposable cold-payload storage. The durable .lino log remains authoritative.
// One small write buffer replaces a Buffer/backing store/native allocation per
// archived message. Private readers use positional reads; public copies detach.
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  writeSync,
  unlinkSync,
  rmdirSync,
  rmSync,
  ftruncateSync,
} from 'node:fs';
import path from 'node:path';

const cleanup = ({ fd, folder }) => {
  if (fd !== null) {
    try {
      closeSync(fd);
    } catch {
      /* already closed */
    }
  }
  if (folder) {
    try {
      rmSync(folder, { recursive: true, force: true });
    } catch {
      /* process exit also closes anonymous files */
    }
  }
};
const finalizer = new FinalizationRegistry(cleanup);
const BLOCK = 65536;
const writeAll = (fd, bytes, offset) => {
  let at = 0;
  while (at < bytes.length) {
    const wrote = writeSync(fd, bytes, at, bytes.length - at, offset + at);
    if (!wrote) {
      throw new Error('cold payload cache write made no progress');
    }
    at += wrote;
  }
};

export const createPayloadFile = (parent) => {
  const resource = { fd: null, folder: null };
  let pending = null;
  let start = 0;
  let used = 0;
  let end = 0;
  let active = 0;
  let closed = false;
  const free = new Map();
  const open = () => {
    if (closed) {
      throw new Error('cold payload cache is closed');
    }
    if (resource.fd !== null) {
      return resource.fd;
    }
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    resource.folder = mkdtempSync(path.join(parent, '.payload-cache-'));
    const file = path.join(resource.folder, 'payloads');
    resource.fd = openSync(file, 'wx+', 0o600);
    // On Unix this becomes anonymous: a crash cannot leave private cache
    // files behind, and each rolling worker has its own independent inode.
    try {
      unlinkSync(file);
      rmdirSync(resource.folder);
      resource.folder = null;
    } catch {
      /* platforms that require close before unlink use cleanup */
    }
    return resource.fd;
  };
  const flush = () => {
    if (used) {
      writeAll(open(), pending.subarray(0, used), start);
      used = 0;
    }
    start = end;
  };
  const cache = {
    write(bytes) {
      if (closed) {
        throw new Error('cold payload cache is closed');
      }
      const capacity = Math.ceil(bytes.length / 64) * 64;
      const holes = free.get(capacity);
      const offset = holes?.length ? holes.pop() : end;
      if (offset === end) {
        if (capacity > BLOCK) {
          flush();
          writeAll(open(), bytes, offset);
          end += capacity;
          start = end;
        } else {
          if (used + capacity > BLOCK) {
            flush();
          }
          pending ??= Buffer.alloc(BLOCK);
          pending.set(bytes, used);
          used += capacity;
          end += capacity;
        }
      } else if (offset >= start && offset + capacity <= start + used) {
        pending.set(bytes, offset - start);
      } else {
        writeAll(open(), bytes, offset);
      }
      active += 1;
      return { offset, length: bytes.length, capacity, owners: 0 };
    },
    read(ref) {
      if (closed) {
        throw new Error('cold payload cache is closed');
      }
      if (ref.offset >= start && ref.offset + ref.length <= start + used) {
        return pending.subarray(
          ref.offset - start,
          ref.offset - start + ref.length
        );
      }
      const bytes = Buffer.allocUnsafe(ref.length);
      let at = 0;
      while (at < bytes.length) {
        const got = readSync(
          open(),
          bytes,
          at,
          bytes.length - at,
          ref.offset + at
        );
        if (!got) {
          throw new Error('cold payload cache ended early');
        }
        at += got;
      }
      return bytes;
    },
    retain(ref) {
      ref.owners += 1;
    },
    release(ref) {
      ref.owners -= 1;
      if (ref.owners > 0) {
        return;
      }
      active -= 1;
      if (active === 0) {
        if (resource.fd !== null) {
          ftruncateSync(resource.fd, 0);
        }
        free.clear();
        start = used = end = 0;
      } else {
        const holes = free.get(ref.capacity) ?? [];
        holes.push(ref.offset);
        free.set(ref.capacity, holes);
      }
    },
    stats: () => ({
      bytes: end,
      residentBytes: pending?.byteLength ?? 0,
      entries: active,
    }),
    close() {
      if (!closed) {
        closed = true;
        cleanup(resource);
        finalizer.unregister(cache);
        pending = null;
        free.clear();
      }
    },
  };
  finalizer.register(cache, resource, cache);
  return cache;
};
