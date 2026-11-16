import { setTimeout as delay } from 'node:timers/promises';

/** Bound elapsed time inside the existing test deadline, independent of disk I/O count. */
export const settledLinkedinFixture = async (read) => {
  const deadline = Date.now() + 3000;
  let row;
  while (Date.now() < deadline) {
    row = await read();
    if (!['opening', 'waiting-login', 'reading'].includes(row.phase)) {
      return row;
    }
    await delay(10);
  }
  throw new Error(`Export did not settle: ${row?.phase ?? 'unobserved'}`);
};
