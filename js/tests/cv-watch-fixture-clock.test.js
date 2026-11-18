import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { cvWatchFixture } from '../../experiments/issue-56/cv-watch-fixture.mjs';

test(
  'fixture mismatch retries keep their logical budget across finite host descheduling',
  { timeout: 3000 },
  async () => {
    const f = cvWatchFixture();
    try {
      await f.service['cv-watch']({
        requestId: 'fixture-clock-mismatch',
        durationMs: 1000,
      });
      await f.emit('save');
      await f.wait('saved');
      const before = await f.service['cv-snapshots']({});
      f.exports([]);
      let waits = 0;
      f.beforeRead(async () => {
        if (waits++ === 0) {
          await delay(80);
        }
      });
      await f.emit('save');
      assert.equal((await f.wait('not-saved')).watch.code, 'jobs-cv-mismatch');
      assert.equal(f.counts().reads, 6);
      assert.equal(f.options.cvWatch.verification.clock.now(), 6);
      assert.deepEqual(await f.service['cv-snapshots']({}), before);
      f.formOpen(true);
      await f.emit('save');
      assert.equal((await f.wait('not-saved')).watch.code, 'jobs-cv-form-open');
      assert.equal(f.counts().reads, 6);
      assert.equal(f.options.cvWatch.verification.clock.now(), 46);
    } finally {
      await f.service.stop();
    }
    assert.equal(f.counts().detached, 1);
  }
);

test(
  'fixture callers can explicitly retain a deadline clock that expires during readback',
  { timeout: 3000 },
  async () => {
    let elapsed = 0;
    const clock = {
      now: () => elapsed,
      wait: async () => {},
    };
    const f = cvWatchFixture({ verification: { clock } });
    f.beforeRead(() => {
      elapsed = 40;
    });
    try {
      assert.equal(f.options.cvWatch.verification.clock, clock);
      await f.service['cv-watch']({
        requestId: 'fixture-clock-deadline',
        durationMs: 1000,
      });
      await f.emit('save');
      assert.equal(
        (await f.wait('not-saved')).watch.code,
        'jobs-cv-readback-timeout'
      );
      assert.equal(f.counts().reads, 1);
      assert.deepEqual((await f.service['cv-snapshots']({})).snapshots, []);
    } finally {
      await f.service.stop();
    }
  }
);
