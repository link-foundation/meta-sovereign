import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import {
  followRunnerSessions,
  canRunnerAction,
} from '../src/web/runner-view-state.js';
import { createRunnerApi } from '../src/web/runner-api.js';

const receipt = (local = 'stopped', server = 'stopped', extra = {}) => ({
  ok: true,
  scope: 'isolated-session',
  states: { local, server },
  ...extra,
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
const fixture = (request) => {
  const timers = new Map();
  let state;
  const owner = followRunnerSessions({
    request,
    update: (next) => {
      state = next;
    },
    clock: {
      setTimeout: (callback, delay) => {
        timers.set(callback, delay);
        return callback;
      },
      clearTimeout: (callback) => timers.delete(callback),
    },
  });
  return { owner, timers, state: () => state };
};

test('runner view reads on open and serializes an explicit action without optimistic state', async () => {
  const calls = [];
  let release;
  const view = fixture(async (action) => {
    calls.push(action);
    if (action === 'start') {
      return new Promise((resolve) => {
        release = () => resolve(receipt('running'));
      });
    }
    return receipt();
  });
  try {
    await tick();
    assert.deepEqual(calls, ['status']);
    const pending = view.owner.act('start', 'local');
    assert.equal(view.state().answer.states.local, 'stopped');
    assert.equal(view.state().busy, true);
    assert.equal(view.timers.size, 0);
    await view.owner.act('start', 'local');
    await view.owner.refresh();
    assert.deepEqual(calls, ['status', 'start']);
    release();
    await pending;
    assert.equal(view.state().answer.states.local, 'running');
    assert.deepEqual(view.state().feedback, {
      id: 1,
      action: 'start',
      mode: 'local',
      state: 'running',
    });
    assert.equal(view.timers.size, 1);
  } finally {
    release?.();
    view.owner.close();
    assert.equal(view.timers.size, 0);
  }
});

test('runner view retains unconfirmed observed states and gates unsafe switches', async () => {
  const view = fixture(async (action) =>
    action === 'status'
      ? receipt()
      : receipt('stopped', 'unknown', {
          ok: false,
          code: 'other-runner-stop-unconfirmed',
        })
  );
  try {
    await tick();
    await view.owner.act('start', 'local');
    assert.equal(view.state().answer.states.server, 'unknown');
    assert.equal(view.state().notice, 'other-runner-stop-unconfirmed');
    assert.equal(view.state().feedback, null);
    assert.equal(canRunnerAction(view.state(), 'start', 'local'), false);
    const blocked = {
      answer: receipt('running', 'stopped', {
        code: 'runner-profile-change-blocked',
      }),
    };
    assert.equal(canRunnerAction(blocked, 'start', 'server'), false);
    assert.equal(canRunnerAction(blocked, 'stop', 'local'), true);
  } finally {
    view.owner.close();
  }
});

test('an unconfirmed backend inspection remains visible until the observed session changes', async () => {
  let server = 'unknown';
  const backend = { kind: 'screen', state: 'missing' };
  const view = fixture(async (action) =>
    receipt(
      'running',
      server,
      action === 'inspect'
        ? {
            ok: false,
            code: 'runner-application-unconfirmed',
            application: { mode: 'server', state: 'unknown' },
            backend,
          }
        : {}
    )
  );
  try {
    await tick();
    await view.owner.act('inspect', 'server');
    const inspection = view.state().inspection;
    assert.deepEqual(inspection.backend, backend);
    await view.owner.refresh();
    assert.equal(view.state().inspection, inspection);
    assert.equal(canRunnerAction(view.state(), 'start', 'server'), false);
    server = 'stopped';
    await view.owner.refresh();
    assert.equal(view.state().inspection, null);
    assert.equal(view.state().notice, null);
  } finally {
    view.owner.close();
  }
});

test('runner recovery performs only a status read after an ambiguous mutation', async () => {
  const calls = [];
  const view = fixture(async (action) => {
    calls.push(action);
    if (action !== 'status') {
      throw new Error('PRIVATE transport failure');
    }
    return calls.length === 1 ? receipt() : receipt('running');
  });
  try {
    await tick();
    await view.owner.act('start', 'local');
    assert.equal(view.state().error, true);
    assert.equal(view.state().answer.states.local, 'stopped');
    assert.equal(canRunnerAction(view.state(), 'start', 'local'), false);
    assert.equal([...view.timers.values()][0], 10000);
    const recover = [...view.timers.keys()][0];
    recover();
    await tick();
    assert.deepEqual(calls, ['status', 'start', 'status']);
    assert.equal(view.state().answer.states.local, 'running');
    assert.equal(view.state().error, false);
    assert.equal(view.state().notice, 'actionNotConfirmed');
    assert.equal(view.state().feedback, null);
    assert.doesNotMatch(JSON.stringify(view.state()), /PRIVATE/);
  } finally {
    view.owner.close();
  }
});

test('runner confirmations belong to explicit receipts and expire on conflicting observations', async () => {
  let local = 'stopped';
  let server = 'stopped';
  const view = fixture(async (action) => {
    if (action === 'start') {
      local = 'running';
    } else if (action === 'stop') {
      local = 'stopped';
    }
    return receipt(local, server);
  });
  try {
    await tick();
    assert.equal(view.state().feedback, null);
    await view.owner.act('start', 'local');
    const first = view.state().feedback;
    assert.equal(first.state, 'running');
    await view.owner.refresh();
    assert.equal(view.state().feedback, first, 'status cannot announce again');
    server = 'unknown';
    await view.owner.refresh();
    assert.equal(view.state().feedback, null);
    server = 'stopped';
    await view.owner.refresh();
    assert.equal(
      view.state().feedback,
      null,
      'recovery cannot create feedback'
    );
    await view.owner.act('stop', 'local');
    assert.deepEqual(view.state().feedback, {
      id: 2,
      action: 'stop',
      mode: 'local',
      state: 'stopped',
    });
  } finally {
    view.owner.close();
  }
});

test('contradictory and closed runner mutation receipts never announce success', async () => {
  let release;
  let invalid = true;
  const view = fixture(async (action) => {
    if (action === 'status') {
      return receipt();
    }
    if (invalid) {
      return receipt('running', 'running');
    }
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  try {
    await tick();
    await view.owner.act('start', 'local');
    assert.equal(view.state().error, true);
    assert.equal(view.state().feedback, null);
    invalid = false;
    await view.owner.refresh();
    const pending = view.owner.act('start', 'local');
    assert.equal(view.state().feedback, null);
    view.owner.close();
    const before = view.state();
    release(receipt('running'));
    await pending;
    assert.equal(view.state(), before);
    assert.equal(view.state().feedback, null);
    assert.equal(view.timers.size, 0);
  } finally {
    release?.(receipt('running'));
    view.owner.close();
  }
});

test('closing runner controls aborts an owned read, ignores its late result and disposes timers', async () => {
  let release;
  let signal;
  const view = fixture(async (_action, _mode, owned) => {
    signal = owned;
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const before = view.state();
  view.owner.close();
  assert.equal(signal.aborted, true);
  release(receipt('running'));
  await tick();
  assert.equal(view.state(), before);
  assert.equal(view.timers.size, 0);
  await view.owner.act('start', 'local');
  await view.owner.refresh();
  assert.equal(view.timers.size, 0);
});

test('browser runner bridge opts out of mutation recovery and rejects unsafe receipts', async () => {
  const calls = [];
  const api = createRunnerApi({
    serverResponse: async (...args) => {
      calls.push(args);
      return { ok: true, json: async () => receipt('running', 'running') };
    },
  });
  await assert.rejects(api.runnerRequest('start', 'local'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].recover, false);
  assert.equal(calls[0][0], '/api/runner/start');
  assert.deepEqual(JSON.parse(calls[0][1].body), { mode: 'local' });
  await assert.rejects(api.runnerRequest('PRIVATE', 'local'));
  assert.equal(calls.length, 1);
});

test('application checks are explicit, serialized and cleared when session observations change', async () => {
  const calls = [];
  let local = 'running';
  const view = fixture(async (action) => {
    calls.push(action);
    return receipt(
      local,
      'stopped',
      action === 'inspect'
        ? { application: { mode: 'local', state: 'ready' } }
        : {}
    );
  });
  try {
    await tick();
    assert.deepEqual(calls, ['status']);
    assert.equal(view.state().inspection, null);
    await view.owner.act('inspect', 'local');
    assert.equal(view.state().inspection.state, 'ready');
    assert.equal(typeof view.state().inspection.checkedAt, 'number');
    await view.owner.refresh();
    assert.equal(view.state().inspection.state, 'ready');
    local = 'stopped';
    await view.owner.refresh();
    assert.equal(view.state().inspection, null);
    assert.deepEqual(calls, ['status', 'inspect', 'status', 'status']);
  } finally {
    view.owner.close();
  }
});

test('closing an application check aborts it and ignores a late positive reply', async () => {
  let release;
  let signal;
  const view = fixture(async (action, _mode, owned) => {
    if (action === 'status') {
      return receipt('running');
    }
    signal = owned;
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  await tick();
  const pending = view.owner.act('inspect', 'local');
  try {
    assert.equal(view.state().inspection, null);
    await view.owner.act('inspect', 'local');
    view.owner.close();
    assert.equal(signal.aborted, true);
    release(
      receipt('running', 'stopped', {
        application: { mode: 'local', state: 'ready' },
      })
    );
    await pending;
    assert.equal(view.state().inspection, null);
    assert.equal(view.timers.size, 0);
  } finally {
    release?.(receipt());
    view.owner.close();
    await pending;
  }
});
