import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifyOwnerCvSave } from '../src/jobs/cv-save-cycle.js';
import { cvCreatedWorkplaceFixture } from '../../experiments/issue-56/cv-created-workplace-fixture.mjs';
import { cvWatchFixture } from '../../experiments/issue-56/cv-watch-fixture.mjs';

const lateRead = (f, stage, elapsed) => {
  const owner = stage === 'form' ? f.options.session.commander : f.options;
  const key = {
    poll: 'wait',
    form: 'evaluate',
    exports: 'readExports',
    list: 'readWorkplaceIds',
    record: 'readWorkplace',
  }[stage];
  const target = stage === 'poll' ? f.options.clock : owner;
  const read = target[key];
  target[key] = async (...args) => {
    const result = await read(...args);
    f.state.elapsed = elapsed;
    return result;
  };
};

for (const stage of ['poll', 'form', 'exports', 'list', 'record']) {
  test(`the ${stage} result at the original deadline cannot confirm Save or start a later read`, async () => {
    const f = cvCreatedWorkplaceFixture();
    lateRead(f, stage, f.options.verificationMs);
    await assert.rejects(verifyOwnerCvSave(f.options), {
      code: 'jobs-cv-readback-timeout',
    });
    assert.equal(f.state.exports, ['poll', 'form'].includes(stage) ? 0 : 1);
    assert.equal(f.state.lists, ['list', 'record'].includes(stage) ? 1 : 0);
    assert.deepEqual(f.state.records, stage === 'record' ? ['987'] : []);
  });
}

for (const kind of ['workplace', 'about']) {
  test(`a known ${kind} export cannot confirm Save after the same deadline`, async () => {
    const f = cvCreatedWorkplaceFixture({ created: false });
    if (kind === 'about') {
      f.options.attempt = { kind, hash: 'english', about: '' };
    }
    lateRead(f, 'exports', f.options.verificationMs + 1);
    await assert.rejects(verifyOwnerCvSave(f.options), {
      code: 'jobs-cv-readback-timeout',
    });
    assert.equal(f.state.exports, 1);
    assert.equal(f.state.lists, 0);
    assert.deepEqual(f.state.records, []);
  });
}

test('a failed read after expiry cannot start another read or replace the deadline refusal', async () => {
  const f = cvCreatedWorkplaceFixture();
  f.options.readExports = async () => {
    f.state.exports++;
    f.state.elapsed = f.options.verificationMs;
    throw new Error('Finite read failure');
  };
  await assert.rejects(verifyOwnerCvSave(f.options), {
    code: 'jobs-cv-readback-timeout',
  });
  assert.equal(f.state.exports, 1);
  assert.equal(f.state.lists, 0);
  assert.deepEqual(f.state.records, []);
});

test('fresh matching readback just before the deadline retains full identity and export proof', async () => {
  const f = cvCreatedWorkplaceFixture();
  lateRead(f, 'record', f.options.verificationMs - 1);
  const result = await verifyOwnerCvSave(f.options);
  assert.deepEqual(result.workplaceIds, ['123', '987']);
  assert.equal(result.exports.length, 2);
  assert.equal(result.exports[0].workplace.recordId, '987');
  assert.equal(result.exports[1].workplace.checked, false);
});

test('an expired read still reports the owner cancellation and drains without another read', async () => {
  const f = cvCreatedWorkplaceFixture();
  const controller = new AbortController();
  const reason = new Error('Owner stopped');
  f.options.signal = controller.signal;
  f.options.check = () => controller.signal.throwIfAborted();
  const read = f.options.readExports;
  f.options.readExports = async () => {
    const result = await read();
    f.state.elapsed = f.options.verificationMs;
    controller.abort(reason);
    return result;
  };
  await assert.rejects(
    verifyOwnerCvSave(f.options),
    (error) => error === reason
  );
  assert.equal(f.state.exports, 1);
  assert.equal(f.state.lists, 0);
  assert.deepEqual(f.state.records, []);
});

test('late successful owner readback retains acknowledged snapshots and allows another fresh Save', async () => {
  let elapsed = 0;
  const f = cvWatchFixture({
    verification: {
      clock: {
        now: () => elapsed,
        wait: async (_ms, _value, { signal }) => signal.throwIfAborted(),
      },
    },
  });
  try {
    await f.service['cv-watch']({ requestId: randomUUID(), durationMs: 1000 });
    await f.emit('save');
    await f.wait('saved');
    const before = await f.service['cv-snapshots']({});
    f.beforeRead(() => {
      elapsed += 40;
    });
    await f.emit('save');
    const refused = await f.wait('not-saved');
    assert.equal(refused.watch.code, 'jobs-cv-readback-timeout');
    assert.equal(refused.watch.saves, 1);
    assert.deepEqual(await f.service['cv-snapshots']({}), before);
    f.beforeRead(null);
    await f.emit('save');
    assert.equal((await f.wait('saved')).watch.saves, 2);
    assert.equal(f.counts().reads, 3);
  } finally {
    await f.service.stop();
  }
  assert.equal(f.counts().detached, 1);
});
