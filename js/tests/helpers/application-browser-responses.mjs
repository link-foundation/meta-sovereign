import { decodeWire } from '../../src/transport/lino.js';
import { applicationResult } from '../../src/jobs/application-result.js';

/** Bounded synthetic-fixture diagnostics, printed only when its scenario fails. */
export const applicationBrowserResponses = (page) => {
  const rows = [];
  const pending = new Set();
  const response = (received) => {
    const request = received.request();
    if (
      request.method() !== 'POST' ||
      !new URL(received.url()).pathname.startsWith(
        '/api/vacancies/application-'
      )
    ) {
      return;
    }
    const task = (async () => {
      const input = decodeWire(
        request.postDataBuffer(),
        request.headers()['content-type']
      );
      const value = decodeWire(
        await received.body(),
        received.headers()['content-type']
      );
      const row = {
        operation: new URL(received.url()).pathname.split('/').at(-1),
        status: received.status(),
        ok: value?.ok,
        code: value?.code ?? value?.error?.code,
        state: value?.state,
        active: value?.active,
        delivery: value?.delivery,
      };
      if (value?.mode === 'hh-application-review') {
        try {
          applicationResult(value, input);
          row.validReceipt = true;
        } catch (error) {
          row.validReceipt = false;
          row.validationCode = error.code;
        }
      }
      rows.push(row);
      if (rows.length > 32) {
        rows.shift();
      }
    })().catch((error) => {
      rows.push({ diagnosticError: error.message });
      if (rows.length > 32) {
        rows.shift();
      }
    });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };
  page.on('response', response);
  return {
    async stop() {
      page.off('response', response);
      await Promise.allSettled(pending);
      return rows;
    },
  };
};
