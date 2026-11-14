import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { followAutoFixture } from './helpers/follow-auto.mjs';

test(
  'uncertain VK membership and its parent run survive closing and reopening a real Lino file',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-auto-follow-reopen-'));
    const stores = [];
    const fixtures = [];
    const open = async () => {
      const store = await createLinoTextStore(path.join(dir, 'data.lino'));
      stores.push(store);
      const fixture = await followAutoFixture({ store });
      fixtures.push(fixture);
      return fixture;
    };
    try {
      const first = await open();
      first.joiningState.response = (method, params, answer) => {
        if (method === 'messages.joinChatByInviteLink') {
          first.joiningState.members.delete(params.link);
          throw new Error('fixture response lost');
        }
        return answer;
      };
      const job = await first.post({
        backlink: 'https://vk.me/join/own_invite',
      });
      assert.equal(job.status, 'paused');
      assert.equal(job.rows[0].following.links[0].status, 'unknown');
      await first.close();
      await stores[0].close();
      const second = await open();
      await second.service.resume({ jobId: job.id, confirm: true });
      await second.service.idle();
      const saved = await second.service.status({ jobId: job.id });
      assert.equal(saved.status, 'paused');
      assert.equal(saved.failure.code, 'outcome-unknown');
      assert.equal(
        saved.rows[0].following.links[0].result.results[0].code,
        'outcome-unknown'
      );
      assert.equal(
        second.joiningCalls.filter(
          (c) => c.method === 'messages.joinChatByInviteLink'
        ).length,
        0
      );
      assert.equal(
        second.vk.calls.filter((c) => c.method === 'messages.send').length,
        0
      );
    } finally {
      for (const f of fixtures) {
        await f.close();
      }
      for (const store of stores) {
        await store.close();
      }
      await rm(dir, { recursive: true, force: true });
    }
  }
);
