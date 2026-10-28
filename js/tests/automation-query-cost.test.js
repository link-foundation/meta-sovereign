import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { listAutomations, draftOperations } from '../src/automation/drafts.js';
import { createAutomationRunner } from '../src/automation/runner.js';

test('automation metadata reads never copy unrelated message records', async () => {
  const memory = createMemoryStore();
  // The query contract must exclude messages before a store copies records.
  await memory.put({ id: 'msg:telegram:1:1', body: 'unrelated message' });
  await memory.put({
    id: 'automation-draft:1',
    status: 'pending',
    source: 'telegram',
    chat: '1',
  });
  let queries = 0;
  const store = {
    ...memory,
    query: (filter) => {
      assert.equal(
        typeof filter,
        'function',
        'filter before copying the store'
      );
      assert.equal(filter({ id: 'msg:telegram:1:1' }), false);
      queries += 1;
      return memory.query(filter);
    },
  };
  assert.ok((await listAutomations(store)).length > 0);
  const operations = draftOperations({ store });
  assert.equal((await operations.drafts({ chat: '2' })).length, 0);
  const runner = createAutomationRunner({ store });
  assert.deepEqual(await runner.history(), []);
  assert.equal(queries, 3);
});
