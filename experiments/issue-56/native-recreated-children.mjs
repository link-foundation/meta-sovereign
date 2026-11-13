// Check the hosted native assertion against actual JavaScript owner admission.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { withCausalWrites } from '../../js/src/storage/causal-writes.js';
import { createPeer } from '../../js/src/sync/peer.js';

test(
  'a stale deletion contributes children without replacing a recreated payload',
  { timeout: 5000 },
  async () => {
    const first = createMemoryStore();
    const owner = withCausalWrites(first, { actor: 'first' });
    await createPeer(owner).receive({
      type: 'put',
      link: { id: 'shared', body: 'old', children: ['c'], vc: { remote: 5 } },
    });
    await owner.put({ id: 'shared', body: 'new', children: ['c'] });
    await owner.delete('shared');
    const deletion = await first.get('shared');
    assert.equal(deletion.body, undefined);
    assert.deepEqual(deletion.children, ['c']);
    const reopened = createMemoryStore();
    await reopened.put(deletion);
    const nextOwner = withCausalWrites(reopened, { actor: 'second' });
    const recreated = await nextOwner.put({ id: 'shared', body: 'recreated' });
    assert.equal(recreated.children, undefined);
    await createPeer(nextOwner).receive({ type: 'delete', link: deletion });
    assert.deepEqual(await nextOwner.get('shared'), {
      id: 'shared',
      body: 'recreated',
      children: ['c'],
      vc: { remote: 5, first: 2, second: 1 },
    });
  }
);
