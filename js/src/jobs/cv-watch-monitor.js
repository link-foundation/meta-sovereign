import { randomUUID } from 'node:crypto';
import {
  readCvEditorDocument,
  observeCvEditorDocument,
} from './cv-watch-document.js';
import { cvWatchUrl } from './cv-watch-browser.js';

/** One existing main frame. Stop removes native listeners and drains bindings. */
export const monitorCvSaves = async ({ page, receive, failed }) => {
  const binding = `__cv_save_${randomUUID().replaceAll('-', '')}`;
  let stopped = false;
  const pending = new Set();
  const content = `(${observeCvEditorDocument.toString()})(${readCvEditorDocument.toString()},${JSON.stringify(binding)});`;
  const run = (operation) => {
    if (stopped) {
      return Promise.resolve();
    }
    let task;
    try {
      task = Promise.resolve(operation()).catch(failed);
    } catch (error) {
      task = Promise.resolve(failed(error));
    }
    pending.add(task);
    void task.then(
      () => pending.delete(task),
      () => pending.delete(task)
    );
    return task;
  };
  const install = () =>
    run(async () => {
      cvWatchUrl(page.url());
      await page.evaluate(content);
    });
  await page.exposeBinding(binding, (source, value) => {
    if (stopped || source.page !== page || source.frame !== page.mainFrame()) {
      return;
    }
    if (pending.size >= 8 || JSON.stringify(value)?.length > 128 * 1024) {
      return run(() => failed({ code: 'jobs-cv-limit' }));
    }
    // receive invalidates in-flight verification synchronously before any await.
    return run(() => receive(value, source.frame.url()));
  });
  cvWatchUrl(page.url());
  await page.evaluate(content);
  page.on('domcontentloaded', install);
  return {
    async stop() {
      stopped = true;
      page.off('domcontentloaded', install);
      await page
        .evaluate((name) => globalThis[`__cv_observer_${name}`]?.(), binding)
        .catch(() => {});
      await Promise.allSettled([...pending]);
    },
  };
};
