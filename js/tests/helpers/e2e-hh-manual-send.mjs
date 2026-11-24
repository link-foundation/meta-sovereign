import assert from 'node:assert/strict';
import { createDefaultSender } from '../../src/sources/browser-sender.js';
import {
  installHhComposer as installComposer,
  openHhManualChatFixture,
} from '../../../experiments/issue-56/hh-manual-chat-fixture.mjs';

export const verifyHhManualChat = async (browser) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const fixture = await openHhManualChatFixture(browser);
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${fixture.base}/#/chat`);
      await page.locator('[data-chat="hh:7"]').click();
      const text = 'Thank you. I can meet on Thursday.';
      const composer = page.locator('.chat-composer textarea');
      await composer.fill(text);
      await composer.press('Enter');
      await page
        .locator('[data-delivery="sent"]')
        .filter({ hasText: text })
        .waitFor({ timeout: 7000 });
      const message = await fixture.store.get('msg:hh:7:102');
      assert.equal(message?.body, text);
      assert.equal(message?.delivery, 'delivered');
      assert.equal(message?.chatName, 'HeadHunter employer');
      assert.equal(
        await fixture.provider.evaluate(
          () => globalThis.window.fixture.textSends
        ),
        1
      );
      assert.equal(fixture.apiWrites(), 0);
      assert.deepEqual(errors, []);
    } finally {
      await fixture.close();
    }
  } finally {
    await context.close();
  }
};

export const verifyHhManualSend = async ({
  run,
  reset,
  page,
  sender,
  mount,
  counters,
}) => {
  const send = createDefaultSender({
    browser: sender,
    getSource: () => ({
      live: { post: async () => assert.fail('A web chat reached the HH API') },
    }),
  });
  const draft = { source: 'hh', chat: 'web:7', text: 'A message from Chat' };

  await run('manual HH text requires a distinct outgoing receipt', async () => {
    await reset();
    await installComposer(page);
    const first = await send(draft);
    assert.equal(first.via, 'browser');
    assert.equal(first.messageId, '102');
    assert.equal(first.link.id, 'msg:hh:7:102');
    assert.equal(first.link.delivery, 'delivered');
    const next = await send({ ...draft, text: 'Another message from Chat' });
    assert.equal(next.messageId, '103');
    assert.deepEqual(await counters(), { clicks: 0, text: 2 });
  });

  await run(
    'manual HH text respects owner drafts and native choices',
    async () => {
      await reset();
      await installComposer(page);
      const composer = page.locator('textarea');
      await composer.fill('Owner draft');
      await assert.rejects(send(draft), { code: 'answer-draft-preserved' });
      assert.equal(await composer.inputValue(), 'Owner draft');
      await composer.fill('');
      await mount();
      await assert.rejects(send(draft), { code: 'answer-choice-required' });
      assert.deepEqual(await counters(), { clicks: 0, text: 0 });
    }
  );

  await run('manual HH text preserves an unconfirmed dispatch', async () => {
    await reset();
    await installComposer(page, 'pending');
    await assert.rejects(send(draft), {
      code: 'send-unknown',
      ambiguous: true,
    });
    await assert.rejects(send(draft), {
      code: 'send-in-doubt',
      ambiguous: true,
    });
    assert.deepEqual(await counters(), { clicks: 0, text: 1 });
  });
};
