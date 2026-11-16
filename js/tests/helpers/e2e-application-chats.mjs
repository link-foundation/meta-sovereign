import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { withNativeApplicationChats } from './application-chats-browser-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { applicationRouteApi } from './application-controls.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { LINO_TEXT } from '../../src/transport/lino.js';

/** Actual child + two native provider fixtures; every account and delivery is synthetic. */
export const verifyNativeApplicationChats = async (
  browser,
  { screenshots, before = false } = {}
) =>
  withNativeApplicationChats(browser, async ({ fixture, chat, logs }) => {
    const controls = applicationPanelBrowser(fixture);
    const batch = controls.panel.locator('[data-application-batch]');
    const field = (name) =>
      batch.locator(`[data-application-batch-field="${name}"]`);
    const button = (name) =>
      batch.locator(`[data-application-batch-action="${name}"]`);
    const api = applicationRouteApi(fixture.base, LINO_TEXT);
    const shot = controls.screenshot(screenshots, 'application-chats');
    await controls.select();
    if (before) {
      await shot('before');
      assert.equal(await field('processChats').count(), 0);
      return { before, chatChildAvailable: false, liveProvider: false };
    }
    await saveAnswerRule(fixture.store, {
      id: 'start-time',
      question: 'What time can you start?',
      answers: [{ text: 'At 9 a.m.', approved: true }],
    });
    assert.equal(await field('processChats').isChecked(), false);
    await field('processChats').check();
    assert.equal(await field('chatsIntervalMinutes').inputValue(), '120');
    assert.equal(await field('chatBrowserSlot').inputValue(), 'chat-slot');
    assert.equal(
      await batch.locator('[data-model-draft-opt-in]').isChecked(),
      false
    );
    await controls.panel.locator('[data-application-option="pacing"]').check();
    await controls.panel
      .locator('[data-application-pacing-interval]')
      .fill('2');
    await field('urls').fill(
      'https://hh.ru/vacancy/123\nhttps://hh.ru/vacancy/456'
    );
    await field('durationMs').fill('180');
    await field('confirmBatch').check();
    await button('start').click();
    if (browser.browserType().name() !== 'chromium') {
      await batch
        .locator('[data-application-chats-phase="refused"]')
        .waitFor({ timeout: 60000 });
      assert.match(
        await batch.innerText(),
        /browser-background-focus-unavailable/u
      );
      await button('stop').click();
      return { unsupportedFocusRefused: true, liveProvider: false };
    }
    await batch
      .locator('[data-application-chats-held]')
      .waitFor({ timeout: 60000 });
    await button('follow').click();
    await controls.panel
      .locator('[data-application-continuation="send"]')
      .waitFor({ timeout: 60000 });
    let receipt = await api.vacancyApplicationBatchStatus({});
    const pid = receipt.batch.chatWorker.pid;
    assert(pid > 0 && pid !== process.pid);
    assert.equal(receipt.batch.chatWorker.held.chat, '8');
    assert.equal(await chat.locator('textarea').inputValue(), 'At 9 a.m.');
    assert.equal(await chat.evaluate(() => window.fixture.sends), 0);
    assert.equal(await chat.evaluate(() => window.fixture.unread['9']), 1);
    const first = nativeApplicationForm(browser);
    assert(
      first && !first.isClosed(),
      'the independent application browser must remain open'
    );
    assert.equal(
      await first.locator('#experience').inputValue(),
      'Five years building Python services.'
    );
    assert.equal(await field('processChats').isDisabled(), true);
    await shot('after');
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await chat.screenshot({
        path: join(screenshots, 'application-chats-native-draft.png'),
        fullPage: true,
      });
    }
    await controls.locales('[data-application-chats-held]');
    await controls.phone();
    await shot('phone');
    // Owner-approved native delivery releases the first application only.
    receipt = await api.vacancyApplicationBatchStatus({});
    const current = receipt.application;
    await api.vacancyApplicationContinue({
      url: current.url,
      browserSlot: current.browserSlot,
      requestId: current.requestId,
      revision: current.revision,
      step: 'send',
      confirm: true,
    });
    await controls.page.waitForFunction(
      () =>
        document.querySelector('[data-application-batch-current]')
          ?.textContent === 'https://hh.ru/vacancy/456',
      null,
      { timeout: 60000 }
    );
    const next = await api.vacancyApplicationBatchStatus({});
    assert.equal(next.batch.delivered, 1);
    assert.equal(next.batch.chatWorker.pid, pid);
    assert.equal(next.batch.chatWorker.held.chat, '8');
    await button('stop').click();
    await batch
      .locator('[data-application-chats-phase="stopped"]')
      .waitFor({ timeout: 60000 });
    assert(chat.isClosed(), 'Stop must close the owned chat context');
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert(
      logs.some(
        (row) =>
          row.event === 'application-chats-review-held' &&
          row.url === 'https://hh.ru/chat/8'
      )
    );
    assert.deepEqual(fixture.errors, []);
    return {
      cases: 1,
      actualChild: true,
      independentNativeBrowsers: true,
      applicationDeliveries: 1,
      chatSends: 0,
      childDrained: true,
      liveProvider: false,
    };
  });
