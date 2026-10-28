// A warm replacement reads a fixed, complete prefix while the writer appends.
// Compaction is held by the owner until handoff or cancellation.
import { promises as fs } from 'node:fs';
import { createInterface } from 'node:readline';
import { decodeLine } from 'lino-objects-codec';

const invalid = (message) =>
  Object.assign(new Error(message), { code: 'STORE_HANDOFF_INVALID' });
export const logCheckpoint = async (file) => {
  const stat = await fs.stat(file);
  return {
    bytes: stat.size,
    inode: String(stat.ino),
    device: String(stat.dev),
  };
};
export const verifyCheckpoint = (stat, checkpoint) => {
  if (
    !Number.isSafeInteger(checkpoint?.bytes) ||
    checkpoint.bytes < 0 ||
    String(stat.ino) !== checkpoint.inode ||
    String(stat.dev) !== checkpoint.device ||
    stat.size < checkpoint.bytes
  ) {
    throw invalid('the log changed identity while preparing a replacement');
  }
};
export const replayLogTail = async (file, checkpoint, accept) => {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    verifyCheckpoint(stat, checkpoint);
    if (stat.size === checkpoint.bytes) {
      return checkpoint;
    }
    const last = Buffer.alloc(1);
    await handle.read(last, 0, 1, stat.size - 1);
    if (last[0] !== 10) {
      throw invalid('the log has an unfinished append');
    }
    const reader = createInterface({
      input: handle.createReadStream({
        start: checkpoint.bytes,
        end: stat.size - 1,
        encoding: 'utf8',
        autoClose: false,
      }),
      crlfDelay: Infinity,
    });
    for await (const line of reader) {
      if (!line.trim()) {
        continue;
      }
      let record;
      try {
        record = decodeLine({ notation: line });
      } catch {
        throw invalid('the handoff tail contains an unreadable record');
      }
      if (typeof record?.id !== 'string') {
        throw invalid('the handoff tail contains an invalid record');
      }
      await accept(record, line.length + 1);
    }
    return { ...checkpoint, bytes: stat.size };
  } finally {
    await handle.close();
  }
};
