import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import {
  reviewBrowser,
  reviewUrl as url,
} from './helpers/forms-session-fixture.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
} from '../src/transport/lino.js';
import { isReadRequest } from '../src/web/request-policy.js';

test(
  'both Lino encodings persist capacity, reject stale/untrusted settings and preserve active reviews',
  { timeout: 10000 },
  async () => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const store = createMemoryStore();
      const { server, base, post } = await formReviewHttp(
        {
          store,
          openSession: async () => reviewBrowser(),
          review: { learn: false, autoCapture: false },
        },
        media
      );
      const list = async () =>
        readWireResponse(
          await fetch(`${base}/api/forms/sessions`, {
            headers: { accept: media },
          })
        );
      try {
        assert.equal((await list()).maxSessions, 4);
        const input = { maxSessions: 17, revision: null };
        assert.equal(
          (
            await post('capacity', input, {
              origin: 'https://untrusted.example',
            })
          ).code,
          'forbidden'
        );
        assert.equal((await list()).maxSessions, 4);
        const saved = await post('capacity', input);
        assert.equal(saved.maxSessions, 17);
        assert.equal((await list()).revision, saved.revision);
        assert.equal(
          (await post('capacity', input)).code,
          'form-capacity-changed'
        );
        const first = await post('open', { url, browserSlot: 'one' });
        await post('open', { url, browserSlot: 'two' });
        assert.equal(
          (await post('capacity', { maxSessions: 1, revision: saved.revision }))
            .code,
          'form-capacity-in-use'
        );
        assert.equal((await post('read', { id: first.session.id })).ok, true);
        const listing = await list();
        assert.equal(listing.sessions.length, 2);
        assert.equal(listing.maxSessions, 17);
        const method = await fetch(`${base}/api/forms/sessions/capacity`);
        assert.equal(method.status, 405);
        assert.equal(
          isReadRequest('/api/forms/sessions/capacity', 'POST'),
          false
        );
      } finally {
        await server.close();
      }
    }
  }
);
