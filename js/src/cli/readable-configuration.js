import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parseIndented } from 'lino-objects-codec';

/** Bound actual reads, including growth after stat; never wait on a FIFO. */
export const readReadableConfiguration = async (file) => {
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!(await handle.stat()).isFile()) {
      throw new Error('Configuration must be a regular file.');
    }
    const buffer = Buffer.alloc(65537);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        size,
        buffer.length - size
      );
      if (!bytesRead) {
        break;
      }
      size += bytesRead;
    }
    if (size === buffer.length) {
      throw new Error('Configuration exceeds 64 KiB.');
    }
    return parseIndented({ text: buffer.subarray(0, size).toString('utf8') })
      .obj;
  } finally {
    await handle.close();
  }
};
