import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  greetingStickerFixture,
  refreshedCatalog,
} from './helpers/greeting-stickers-fakes.mjs';

test('a reviewed sticker send rechecks its account immediately before the RPC', async () => {
  const fixture = greetingStickerFixture();
  await refreshedCatalog(fixture);
  await fixture.catalog.select(fixture.c, '11');
  const answer = await fixture
    .sendDocument({ chat: '9', id: '11', clientId: 'guarded' }, async () => {
      throw Object.assign(new Error('account-changed'), {
        code: 'account-changed',
      });
    })
    .catch((error) => ({ code: error.code }));
  assert.equal(answer.code, 'account-changed');
  assert.equal(
    fixture.calls.filter((call) => call.className === 'SendMedia').length,
    0
  );
});

test('a reviewed sticker send uses the freshly verified input peer', async () => {
  const fixture = greetingStickerFixture();
  await refreshedCatalog(fixture);
  await fixture.catalog.select(fixture.c, '11');
  const peer = { userId: 9n, accessHash: 321n };
  let checked = 0;
  const answer = await fixture.sendDocument(
    { chat: '9', id: '11', clientId: 'guarded' },
    async (c) => {
      assert.equal(c.client, fixture.client);
      checked += 1;
      return peer;
    }
  );
  assert.equal(checked, 1);
  assert.equal(answer.messageId, '1');
  assert.equal(
    fixture.calls.find((call) => call.className === 'SendMedia').peer,
    peer
  );
});
