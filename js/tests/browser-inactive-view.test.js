import test from 'node:test';
import assert from 'node:assert/strict';
import {
  browserInactiveView,
  prepareBrowserInactiveView,
  withInactiveBrowserView,
} from '../src/sources/browser-inactive-view.js';
import { inactiveViewFixture } from '../../experiments/issue-56/inactive-view-fixture.mjs';

const control = (fixture, operation, token = 'first') =>
  fixture.evaluate({ fn: browserInactiveView, args: [{ operation, token }] });
const adapter = (owner, child = owner) => ({
  evaluateOwner: (input) => Promise.resolve(owner.evaluate(input)),
  evaluate: (input) => Promise.resolve(child.evaluate(input)),
});

test('native focus preparation disables Playwright emulation and drains the protocol session', async () => {
  const events = [];
  const context = {
    browser: () => ({ browserType: () => ({ name: () => 'chromium' }) }),
    newCDPSession: async () => ({
      send: async (...args) => events.push(args),
      detach: async () => events.push('detached'),
    }),
  };
  await prepareBrowserInactiveView({ context: () => context });
  assert.deepEqual(events, [
    ['Emulation.setFocusEmulationEnabled', { enabled: false }],
    'detached',
  ]);
  context.newCDPSession = async () => ({
    send: async () => {
      throw new Error('Protocol unavailable');
    },
    detach: async () => events.push('failure-detached'),
  });
  await assert.rejects(prepareBrowserInactiveView({ context: () => context }), {
    code: 'browser-background-focus-unavailable',
  });
  assert.equal(events.at(-1), 'failure-detached');
  context.browser = () => ({ browserType: () => ({ name: () => 'webkit' }) });
  await assert.rejects(prepareBrowserInactiveView({ context: () => context }), {
    code: 'browser-background-focus-unavailable',
  });
  assert.equal(events.at(-1), 'failure-detached');
});

test('a focused provider refuses background admission without listeners or work', async () => {
  const owner = inactiveViewFixture(true);
  let reads = 0;
  await assert.rejects(
    withInactiveBrowserView(adapter(owner), async () => reads++),
    { code: 'browser-background-owner-active', fallback: false }
  );
  assert.equal(reads, 0);
  assert.equal(owner.listeners(), 0);
});

test('focus remains latched after the owner leaves again and release removes every hook', () => {
  const owner = inactiveViewFixture();
  assert.equal(control(owner, 'open').state, 'ready');
  assert.equal(owner.listeners(), 8);
  owner.focus(true);
  owner.focus(false);
  assert.equal(control(owner, 'status').state, 'owner-active');
  assert.equal(control(owner, 'release').state, 'owner-active');
  assert.equal(owner.listeners(), 0);
  assert.equal(control(owner, 'open').state, 'ready');
  control(owner, 'release');
});

test('another token cannot inspect or release a lease and the same token is idempotent', () => {
  const owner = inactiveViewFixture();
  assert.equal(control(owner, 'open').state, 'ready');
  assert.equal(control(owner, 'open').state, 'ready');
  assert.equal(owner.listeners(), 8);
  for (const operation of ['open', 'status', 'release']) {
    assert.equal(control(owner, operation, 'other').state, 'busy');
  }
  assert.equal(owner.listeners(), 8);
  control(owner, 'release');
  assert.equal(owner.listeners(), 0);
});

test('input and trusted owner activity interrupt the lease, synthetic pointer input does not', () => {
  const owner = inactiveViewFixture();
  control(owner, 'open');
  owner.document.emit('pointerdown', false);
  assert.equal(control(owner, 'status').state, 'ready');
  for (const [event, trusted] of [
    ['wheel', true],
    ['input', false],
  ]) {
    owner.document.emit(event, trusted);
    assert.equal(control(owner, 'status').state, 'owner-active');
    control(owner, 'release');
    control(owner, 'open');
  }
  control(owner, 'release');
  assert.equal(owner.listeners(), 0);
});

test('an inactive child cannot grant ownership while its outer page is focused', async () => {
  const owner = inactiveViewFixture(true);
  const child = inactiveViewFixture();
  await assert.rejects(
    withInactiveBrowserView(adapter(owner, child), assert.fail),
    {
      code: 'browser-background-owner-active',
    }
  );
  assert.equal(child.listeners(), 0);
  assert.equal(owner.listeners(), 0);
});

test('same-document and child reads retain their result and always release both leases', async () => {
  for (const framed of [false, true]) {
    const owner = inactiveViewFixture();
    const child = framed ? inactiveViewFixture() : owner;
    const result = await withInactiveBrowserView(
      adapter(owner, child),
      async (verify) => {
        await verify();
        assert.equal(owner.listeners(), 8);
        assert.equal(child.listeners(), 8);
        return 'observed history';
      }
    );
    assert.equal(result, 'observed history');
    assert.equal(owner.listeners(), 0);
    assert.equal(child.listeners(), 0);
  }
});

test('outer focus during a child read refuses its result and removes both hooks', async () => {
  const owner = inactiveViewFixture();
  const child = inactiveViewFixture();
  await assert.rejects(
    withInactiveBrowserView(adapter(owner, child), async (verify) => {
      owner.focus(true);
      owner.focus(false);
      await verify();
      assert.fail('An interrupted read must stop');
    }),
    { code: 'browser-background-owner-active' }
  );
  assert.equal(owner.listeners(), 0);
  assert.equal(child.listeners(), 0);
});

test('partial admission and read failures drain leases without releasing another owner', async () => {
  const owner = inactiveViewFixture();
  const child = inactiveViewFixture();
  control(child, 'open', 'other');
  await assert.rejects(
    withInactiveBrowserView(adapter(owner, child), assert.fail),
    {
      code: 'browser-background-busy',
    }
  );
  assert.equal(owner.listeners(), 0);
  assert.equal(child.listeners(), 8);
  control(child, 'release', 'other');
  const error = new Error('Reader refused');
  await assert.rejects(
    withInactiveBrowserView(adapter(owner, child), async () => {
      throw error;
    }),
    error
  );
  assert.equal(owner.listeners(), 0);
  assert.equal(child.listeners(), 0);
  await assert.rejects(withInactiveBrowserView({}, assert.fail), {
    code: 'browser-background-unavailable',
  });
});
