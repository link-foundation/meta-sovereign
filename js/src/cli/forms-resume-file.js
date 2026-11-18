import { open } from 'node:fs/promises';
import { basename } from 'node:path';
import { MAX_RESUME_BYTES, resumePdf } from '../forms/resume-upload.js';

export const loadResumePdf = async (path) => {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_RESUME_BYTES) {
      throw new Error('Choose a regular PDF résumé of at most 8 MiB.');
    }
    // Bound even a file concurrently grown after stat; never read an unbounded stream.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_RESUME_BYTES + 1));
    const { bytesRead } = await handle.read(buffer);
    if (bytesRead !== stat.size) {
      throw new Error('The résumé changed while being read. Choose it again.');
    }
    const file = {
      name: basename(path),
      data: buffer.subarray(0, bytesRead).toString('base64'),
    };
    resumePdf(file);
    return file;
  } finally {
    await handle.close();
  }
};
