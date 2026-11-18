import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gratitudeMessage as message } from '../../experiments/issue-56/vk-gratitude-fixture.mjs';
import {
  contextualPreset,
  seedContextual,
} from '../../experiments/issue-56/vk-contextual-fixture.mjs';
import { planAutomation } from '../src/automation/automations.js';

test('reply fixtures retain logical turn ordering when the host clock advances between setup and assertions', async (context) => {
  let now = Date.now();
  context.mock.method(Date, 'now', () => now);
  const store = await seedContextual('clarification');
  const records = (await store.query()).filter(
    (record) => record.chat === '41'
  );
  now += 3000;
  const older = message(0, '41', 'Older incoming');
  assert.ok(older.timestamp < records[0].timestamp);
  assert.equal(
    planAutomation([older, ...records], contextualPreset('clarification'), {
      targets: [{ source: 'vk', chat: '41' }],
    }).drafts.length,
    1
  );
  const intervening = message(1.5, '41', 'Intervening incoming');
  assert.ok(intervening.timestamp > records[0].timestamp);
  assert.ok(intervening.timestamp < records[1].timestamp);
});
