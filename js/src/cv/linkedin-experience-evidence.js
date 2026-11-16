import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { linkedinExportFailure as failure } from './linkedin-experience-record.js';

/** Bound allocation before reading and verify the complete acknowledged file. */
export const readLinkedinEvidence = async (root, row, name) => {
  const file =
    row.phase === 'completed' && row.files.find((entry) => entry.name === name);
  if (
    !file ||
    !['linkedin-experience.txt', 'linkedin-experience.json'].includes(name)
  ) {
    throw failure('evidence');
  }
  const handle = await fs.open(path.join(root, row.requestId, name), 'r');
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.size !== file.size ||
      stat.size > 2 * 1024 * 1024
    ) {
      throw failure('evidence');
    }
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset
      );
      if (!bytesRead) {
        break;
      }
      offset += bytesRead;
    }
    const content = bytes.subarray(0, offset);
    if (
      offset !== file.size ||
      createHash('sha256').update(content).digest('hex') !== file.sha256
    ) {
      throw failure('evidence');
    }
    return { ...file, text: content.toString('utf8') };
  } finally {
    await handle.close();
  }
};
