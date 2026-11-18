import { webkit } from 'playwright';
import { decodeWire } from '../../js/src/transport/lino.js';
import { verifyNativeApplicationBatch } from '../../js/tests/helpers/e2e-application-batch.mjs';

// One synthetic two-vacancy batch. Never connect to the live provider.
const browser = await webkit.launch({ headless: true });
const pending = new Set();
const createContext = browser.newContext.bind(browser);
browser.newContext = async (...args) => {
  const context = await createContext(...args);
  context.on('response', (response) => {
    if (!response.url().includes('/api/vacancies/application-')) {
      return;
    }
    const task = (async () => {
      const value = decodeWire(
        await response.body(),
        response.headers()['content-type']
      );
      console.log(
        JSON.stringify({
          response: response.url(),
          status: response.status(),
          value,
        })
      );
    })().catch((error) =>
      console.log(JSON.stringify({ traceError: error.message }))
    );
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  return context;
};
try {
  console.log(JSON.stringify(await verifyNativeApplicationBatch(browser)));
} finally {
  await Promise.allSettled(pending);
  await browser.close();
}
