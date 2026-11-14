import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRelayIdentity,
  createRelayOutbox,
} from '../src/sync/peer-relay.js';

const event = (id, via = ['remote']) => ({
  type: 'put',
  link: { id: 'record' },
  relay: { id, via },
});

test('bounded replay and pending caches retain route loop protection after eviction', () => {
  const identity = createRelayIdentity({ maxSeen: 2, maxHops: 3 });
  const own = identity.local(event('unused'));
  const accepted = identity.accept(event('one'));
  assert.equal(identity.accept(event('one')), null);
  const second = identity.accept(event('two'));
  assert.throws(() => identity.accept(event('three')), {
    code: 'SYNC_RELAY_FULL',
  });
  identity.finish(accepted, false);
  const retry = identity.accept(event('one'));
  identity.finish(retry, true);
  identity.finish(second, true);
  identity.local(event('evict'));
  assert.equal(
    identity.accept(own),
    null,
    'route protects an evicted local operation'
  );
  assert.throws(() => identity.accept(event('long', ['a', 'b', 'c'])), {
    code: 'SYNC_RELAY_LIMIT',
  });
});

test('malformed routes are rejected before retaining an operation', () => {
  for (const relay of [
    null,
    {},
    { id: {}, via: [] },
    { id: 'x', via: 'remote' },
    { id: 'x', via: [] },
    { id: 'x', via: ['a'.repeat(65)] },
    { id: 'x'.repeat(65), via: ['a'] },
  ]) {
    const identity = createRelayIdentity();
    assert.throws(
      () => identity.accept({ type: 'put', link: { id: 'x' }, relay }),
      { code: 'SYNC_RELAY_INVALID' }
    );
  }
});

test('a tiny outbox reports overflow, snapshots inputs and drains after commit or abort', () => {
  const sent = [];
  const errors = [];
  const outbox = createRelayOutbox(
    (value) => sent.push(value),
    (error) => errors.push(error.code),
    { maxBytes: 2048, maxEntries: 2 }
  );
  const first = event('first');
  const receipt = outbox.reserve(first);
  first.link.id = 'mutated';
  outbox.local(event('second'));
  outbox.local(event('overflow'));
  assert.deepEqual(errors, ['SYNC_RELAY_FULL']);
  assert.deepEqual(sent, []);
  receipt.commit();
  assert.deepEqual(
    sent.map((value) => value.link.id),
    ['record', 'record']
  );
  const aborted = outbox.reserve(event('aborted'));
  outbox.local(event('after'));
  aborted.abort();
  assert.deepEqual(
    sent.map((value) => value.relay.id),
    ['first', 'second', 'after']
  );
  const limited = createRelayOutbox(
    () => assert.fail('overflow was sent'),
    (error) => errors.push(error.code),
    { maxBytes: 1 }
  );
  limited.reserve(event('bytes')).commit();
  assert.equal(errors.at(-1), 'SYNC_RELAY_FULL');
});
