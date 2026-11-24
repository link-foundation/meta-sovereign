// Finite isolated HTTP checks: no browser, provider calls, files or background
// import/scheduler jobs. Also used by a fresh-process module-loading observer.
import assert from 'node:assert/strict';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
} from '../../js/src/transport/lino.js';

export const exerciseDeferredRoutes = async (observe = () => {}, signal) => {
  const handle = await startServer({
    port: 0,
    store: createMemoryStore(),
    telegramAccount: false,
    enableHandlers: false,
    enableSync: false,
    automations: { scheduler: false },
    emailPoll: false,
    backups: { intervalHours: 0 },
    vacancies: { availability: async () => ({ available: true }) },
  });
  const base = `http://127.0.0.1:${handle.port}`;
  const request = async (path, init) => {
    const response = await fetch(`${base}${path}`, { signal, ...init });
    return {
      status: response.status,
      body: await readWireResponse(response),
    };
  };
  try {
    observe('started');
    assert.equal((await request('/api/status')).status, 200);
    assert.equal((await request('/api/vacancies-lookalike')).status, 404);
    assert.equal(
      (
        await request('/api/cv/platforms', {
          headers: { origin: 'https://untrusted.invalid' },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await request('/api/vacancies/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
      415
    );
    observe('guarded');
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      // Overlapping first requests exercise the native ESM import cache.
      const catalogues = await Promise.all([
        request('/api/cv/platforms', { headers: { accept: type } }),
        request('/api/cv/platforms', { headers: { accept: type } }),
      ]);
      for (const { status, body } of catalogues) {
        assert.equal(status, 200);
        assert.ok(body.some((platform) => platform.id === 'hh'));
      }
      observe('cv');
      const vacancy = await request('/api/vacancies/capabilities', {
        headers: { accept: type },
      });
      assert.equal(vacancy.status, 200);
      assert.equal(vacancy.body.available, true);
      assert.equal(vacancy.body.apply, false);
      observe('vacancies');
      const telegram = await request('/api/telegram/status', {
        headers: { accept: type },
      });
      assert.equal(telegram.status, 200);
      assert.equal(telegram.body.available, false);
      assert.equal(telegram.body.connected, false);
      observe('telegram');
    }
    assert.equal(
      (await request('/api/vacancies/not-an-operation')).status,
      404
    );
    assert.equal(
      (await request('/api/vacancies/capabilities', { method: 'POST' })).status,
      405
    );
    observe('finished');
  } finally {
    await handle.close();
  }
};
