import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import {
  editRunnerProfile,
  canSaveRunnerProfile,
} from '../src/web/runner-profile-state.js';
import { createRunnerApi } from '../src/web/runner-api.js';
import { requestRunner } from '../src/cli/runner-client.js';
import { runnerProfileReceipt } from '../src/transport/runner-profile-receipt.js';

const saved = (document = 'original', revision = 'a'.repeat(64)) => ({
  ok: true,
  document,
  revision,
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
const fixture = (request) => {
  let state;
  const editor = editRunnerProfile({
    request,
    update: (next) => {
      state = next;
    },
  });
  return { editor, state: () => state };
};

test('profile editor serializes a save and preserves newer owner text through its acknowledgement', async () => {
  const calls = [];
  const held = Promise.withResolvers();
  const view = fixture(async (action, input) => {
    calls.push([action, input]);
    return action === 'profile' ? saved() : held.promise;
  });
  try {
    await tick();
    assert.equal(canSaveRunnerProfile(view.state()), false);
    view.editor.edit('first edit');
    const pending = view.editor.save();
    assert.equal(view.state().saved.document, 'original');
    await view.editor.save();
    await view.editor.reload();
    view.editor.edit('newer edit');
    held.resolve(saved('canonical first edit', 'b'.repeat(64)));
    await pending;
    assert.equal(view.state().draft, 'newer edit');
    assert.equal(view.state().saved.revision, 'b'.repeat(64));
    assert.equal(view.state().acknowledged, false);
    assert.equal(canSaveRunnerProfile(view.state()), true);
    assert.deepEqual(calls, [
      ['profile', undefined],
      ['configure', { document: 'first edit', revision: 'a'.repeat(64) }],
    ]);
  } finally {
    held.resolve(saved());
    view.editor.close();
  }
});

test('uncertain profile writes retain the draft, block retries and require an explicit read to replace it', async () => {
  const calls = [];
  const view = fixture(async (action) => {
    calls.push(action);
    if (action === 'configure') {
      throw new Error('PRIVATE conflict or lost acknowledgement');
    }
    return calls.length === 1 ? saved() : saved('other owner', 'c'.repeat(64));
  });
  try {
    await tick();
    view.editor.edit('my draft');
    await view.editor.save();
    assert.equal(view.state().error, true);
    assert.equal(view.state().draft, 'my draft');
    assert.equal(view.state().saved.document, 'original');
    await view.editor.save();
    assert.deepEqual(calls, ['profile', 'configure']);
    assert.doesNotMatch(JSON.stringify(view.state()), /PRIVATE/);
    await view.editor.reload();
    assert.equal(view.state().draft, 'other owner');
    assert.equal(view.state().error, false);
  } finally {
    view.editor.close();
  }
});

test('closing a profile editor aborts its owned request and ignores late results and edits', async () => {
  const held = Promise.withResolvers();
  let signal;
  const view = fixture(async (_action, _input, owned) => {
    signal = owned;
    return held.promise;
  });
  const before = view.state();
  view.editor.edit('ignored during read');
  assert.equal(view.state(), before);
  view.editor.close();
  assert.equal(signal.aborted, true);
  held.resolve(saved());
  await tick();
  view.editor.edit('ignored after close');
  await view.editor.reload();
  assert.equal(view.state(), before);
});

test('browser and CLI profile bridges refuse malformed receipts without replaying writes', async () => {
  const calls = [];
  const api = createRunnerApi({
    serverResponse: async (...args) => {
      calls.push(args);
      return { ok: true, json: async () => saved('canonical') };
    },
  });
  assert.deepEqual(
    await api.runnerProfileRequest('configure', {
      document: 'draft',
      revision: 'a'.repeat(64),
    }),
    saved('canonical')
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2], { network: true, recover: false });
  assert.equal(calls[0][0], '/api/runner/configure');
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    document: 'draft',
    revision: 'a'.repeat(64),
  });
  for (const value of [
    { ok: true },
    saved('界'.repeat(21846)),
    { ...saved(), revision: 'PRIVATE' },
    { ...saved(), ok: false },
  ]) {
    assert.throws(() => runnerProfileReceipt(value));
  }
  assert.deepEqual(
    runnerProfileReceipt({ ...saved(), states: 'PRIVATE' }),
    saved()
  );
  await assert.rejects(
    api.runnerProfileRequest('configure', {
      document: 'draft',
      revision: 'bad',
    })
  );
  await assert.rejects(api.runnerProfileRequest('start'));
  assert.equal(calls.length, 1);
  let requests = 0;
  await assert.rejects(
    requestRunner(
      {
        url: 'http://fixture.invalid',
        action: 'configure',
        document: 'draft',
        revision: 'a'.repeat(64),
      },
      async (_url, init) => {
        requests++;
        assert.equal(init.redirect, 'error');
        throw new Error('lost acknowledgement');
      }
    )
  );
  assert.equal(requests, 1);
});
