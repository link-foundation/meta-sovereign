import { open } from 'node:fs/promises';
import { validateFormInspection } from '../forms/plan-validation.js';

/** Bound concurrent growth as well as the original stat; never open app data. */
export const loadFormInspection = async (file) => {
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 4 * 1024 ** 2) {
      throw new Error('Choose an inspection JSON file up to 4 MiB.');
    }
    const bytes = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await handle.read(bytes);
    if (bytesRead !== stat.size) {
      throw new Error(
        'The inspection changed while being read. Read it again.'
      );
    }
    return validateFormInspection(
      JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'))
    );
  } finally {
    await handle.close();
  }
};
