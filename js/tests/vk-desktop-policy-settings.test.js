import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVkFriendSettings } from '../src/automation/vk-friends-settings.js';
test('saved friend policy retains the distinct desktop selection', () => {
  const settings = {
    enabled: false,
    everyMinutes: 20,
    maxFriends: 10000,
    batchSize: 23,
    priorityIds: [],
    acceptancePolicy: 'desktop-ten-percent',
  };
  assert.equal(
    normalizeVkFriendSettings(settings).acceptancePolicy,
    'desktop-ten-percent'
  );
  assert.throws(
    () =>
      normalizeVkFriendSettings({ ...settings, acceptancePolicy: 'unknown' }),
    /acceptancePolicy/
  );
});
