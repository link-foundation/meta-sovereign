import { open } from 'node:fs/promises';
import { decodeWire, LINO_TEXT, LINO_BINARY } from '../transport/lino.js';

const reviewInput = (operation, args) => {
  if (operation === 'technology-review') {
    return {
      browserSlot: args['browser-slot'] ?? 'jobs',
      revision: args.revision,
      exports: ['ru', 'en'].map((language) => ({
        exportId: args[`${language}-export-id`],
        hash: args[`${language}-resume`],
      })),
    };
  }
  if (operation === 'technology-review-save') {
    return {
      browserSlot: args['browser-slot'] ?? 'jobs',
      fingerprint: args.fingerprint,
      selected:
        typeof args.selected === 'string' ? args.selected.split(',') : [],
    };
  }
};

/** Bounded explicit catalog file; JSON and both typed Lino encodings are accepted. */
export const technologyCommandInput = async (operation, args) => {
  if (
    operation.startsWith('technology-review') &&
    operation !== 'technology-review-stored'
  ) {
    return reviewInput(operation, args);
  }
  if (operation !== 'technology-catalog-save') {
    return {
      browserSlot: args['browser-slot'] ?? 'jobs',
      exportId: args['export-id'],
      hash: args.resume,
      revision: args.revision,
    };
  }
  if (typeof args.file !== 'string') {
    throw new Error('Use --file=<catalog.lino|catalog.bin|catalog.json>.');
  }
  return boundedCommandFile(args.file);
};

export const boundedCommandFile = async (file) => {
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 256 * 1024) {
      throw new Error('Input files must be at most 256 KiB.');
    }
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const part = await handle.read(bytes, offset, bytes.length - offset);
      if (!part.bytesRead) {
        throw new Error('Input file changed while reading.');
      }
      offset += part.bytesRead;
    }
    if ((await handle.read(Buffer.alloc(1), 0, 1)).bytesRead) {
      throw new Error('Input file changed while reading.');
    }
    return file.endsWith('.json')
      ? JSON.parse(bytes.toString('utf8'))
      : decodeWire(bytes, file.endsWith('.bin') ? LINO_BINARY : LINO_TEXT);
  } finally {
    await handle.close();
  }
};
