import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { recoverOutbox, listOutbox } from '../src/automation/outbox.js';
import { readAnswerPolicy } from '../src/automation/question-policy.js';
import {
  noticePolicyFixture,
  noticeSnapshot,
  rejectionText,
} from '../../experiments/issue-56/notice-policy-fixture.mjs';

for (const uncertain of [false, true]) {
  test(
    `reopened Lino retains rejection policy and ${uncertain ? 'unknown holds' : 'full positive receipts'} without resuming or repeating`,
    { timeout: 10000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'ms-notice-restart-'));
      const file = join(directory, 'store.lino');
      let store;
      let env;
      try {
        store = await createLinoTextStore(file);
        env = await noticePolicyFixture({
          store,
          body: rejectionText,
          notices: { rejections: 'reply', rejectionReply: 'May I ask why?' },
          ...(uncertain ? { issue: async () => ({ via: 'browser' }) } : {}),
        });
        await env.browser.watchStart(env.input);
        const first = await env.until((s) =>
          uncertain ? s.phase === 'unknown' && !s.owned : s.phase === 'sent'
        );
        const original = env.input;
        await env.browser.close();
        await store.flush();
        await store.close();
        store = await createLinoTextStore(file);
        await recoverOutbox(store);
        assert.equal(
          (await readAnswerPolicy(store)).notices.rejectionReply,
          'May I ask why?'
        );
        const reservations = await listOutbox(store);
        assert.equal(reservations.length, 2);
        assert.equal(
          reservations.every(
            (row) => row.status === (uncertain ? 'unknown' : 'sent')
          ),
          true
        );
        env = await noticePolicyFixture({ store, body: rejectionText });
        assert.equal((await env.browser.watchStart(original)).owned, false);
        assert.equal(env.state.opens, 0);
        env.state.rows.at(-1).id = '103';
        env.state.snapshot = noticeSnapshot(env.state.rows);
        env.input.review = (await env.browser.inspect(env.review.target)).id;
        await env.browser.watchStart(env.input);
        const retained = await env.until((s) =>
          uncertain ? s.phase === 'unknown' && !s.owned : s.phase === 'sent'
        );
        assert.equal(retained.selection.key, first.selection.key);
        assert.deepEqual(env.state.sends, []);
        if (!uncertain) {
          assert.deepEqual(retained.outbox.receipt, first.outbox.receipt);
          assert.equal(retained.selection.text, 'May I ask why?');
        }
      } finally {
        await env?.browser.close();
        await store?.flush();
        await store?.close();
        await rm(directory, { recursive: true, force: true });
      }
    }
  );
}
