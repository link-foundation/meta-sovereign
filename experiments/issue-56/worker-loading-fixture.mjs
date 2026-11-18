// Finite module-load gate for the production worker's IPC/EOF regression.
import { access, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const gate = process.env.MS_WORKER_LOADING_FIXTURE;
await writeFile(`${gate}.entered`, 'entered');
let released = false;
for (let attempt = 0; attempt < 200; attempt++) {
  if (
    await access(`${gate}.release`).then(
      () => true,
      () => false
    )
  ) {
    released = true;
    break;
  }
  await sleep(10);
}
if (!released) {
  throw new Error('Finite worker import fixture was not released');
}
export const createRollingWorker = async () => ({
  port: 12345,
  close: () => writeFile(`${gate}.closed`, 'closed'),
});
