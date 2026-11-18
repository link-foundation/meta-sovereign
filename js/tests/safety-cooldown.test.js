import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { DAY_MS } from '../src/crm/reengage.js';
import { buildMessageLink } from '../src/sources/link.js';
import { saveSettings } from '../src/automation/safety.js';
import {
  automationPresets,
  planAutomation,
} from '../src/automation/automations.js';
import { translate } from '../src/web/i18n.js';

const NOW = Date.parse('2026-11-17T12:00:00Z');

test('shared fractional cooldown and reset retain explicit automation and silence precedence', async () => {
  const store = createMemoryStore();
  const automation = {
    ...automationPresets().find(
      (item) => item.id === 'automation:reengage-dormant'
    ),
    conditions: {
      silentDays: 0,
      cooldownDays: null,
      lastFrom: 'any',
      mutual: false,
    },
    limit: 0,
  };
  await store.put(
    buildMessageLink({
      source: 'vk',
      externalId: '1',
      sender: 'anna',
      chat: '201',
      body: 'Hello',
      timestamp: new Date(NOW - 120 * DAY_MS).toISOString(),
    })
  );
  await store.put({
    id: 'outbox:cooldown-fixture',
    owner: automation.id,
    source: 'vk',
    chat: '201',
    status: 'sent',
    at: new Date(NOW - 4 * DAY_MS).toISOString(),
  });
  const plan = async (conditions = automation.conditions, now = NOW) =>
    planAutomation(await store.query(), { ...automation, conditions }, { now });
  await saveSettings(store, {
    quietHours: { enabled: false },
    cooldownDays: 5.5,
  });
  assert.equal((await plan()).excluded[0].reason, 'already-sent');
  assert.equal((await plan(undefined, NOW + 1.5 * DAY_MS)).drafts.length, 1);
  assert.equal(
    (await plan({ ...automation.conditions, cooldownDays: 1 })).drafts.length,
    1
  );
  assert.equal(
    (await plan({ ...automation.conditions, silentDays: 10 }, NOW + 4 * DAY_MS))
      .excluded[0].reason,
    'already-sent'
  );
  await saveSettings(store, { cooldownDays: null });
  assert.equal(
    (await plan(undefined, NOW + 2 * DAY_MS)).excluded[0].reason,
    'already-sent'
  );
  assert.equal((await plan(undefined, NOW + 3 * DAY_MS)).drafts.length, 1);
  await store.close?.();
});

test('all cooldown controls explain defaults with translated labels and errors', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    for (const key of ['label', 'hint', 'invalid']) {
      const name = `safety.cooldown.${key}`;
      const text = translate(locale, name, { days: 7 });
      assert.notEqual(text, name);
      assert.equal(text.includes('{days}'), false);
      if (key === 'hint') {
        assert.match(text, /7/u);
      }
      if (locale !== 'en') {
        assert.notEqual(text, translate('en', name, { days: 7 }));
      }
    }
  }
});
