import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { withNativeApplicationChats } from './application-chats-browser-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { applicationRouteApi } from './application-controls.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { wirePost } from './vacancy-routes.mjs';
import { LINO_TEXT } from '../../src/transport/lino.js';

const waitForFirstPass = async (child) => {
  for (let attempt = 0; attempt < 160; attempt++) {
    const worker = child();
    const view = worker?.status();
    if (view?.phase === 'running') {
      const receipt = await worker.browser.unreadStatus({ id: view.passId });
      if (receipt.polling?.phase === 'waiting' && receipt.polling.nextAt) {
        return view;
      }
    }
    await delay(100);
  }
  assert.fail('The first application chat pass did not settle.');
};

const acceptSend = async (base, api) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const { application } = await api.vacancyApplicationBatchStatus({});
    const { url, browserSlot, requestId, revision } = application;
    const response = await wirePost(
      base,
      'application-continue',
      { url, browserSlot, requestId, revision, step: 'send', confirm: true },
      LINO_TEXT
    );
    if (response.status === 409 && response.value.code === 'jobs-busy') {
      await delay(100);
      continue;
    }
    assert.equal(response.status, 200, JSON.stringify(response.value));
    return response.value;
  }
  assert.fail('The application writer did not become available.');
};

const submitWithWaitingChat = async ({ application, chat, base, api }) => {
  const deliveredChat = Promise.withResolvers();
  await application.exposeBinding('fixtureOpenWaitingChat', async () => {
    try {
      deliveredChat.resolve(
        await chat.evaluate(() => {
          window.fixture.hidden.length = 0;
          globalThis.renderList();
          return {
            unread: window.fixture.unread['8'],
            visits: window.fixture.visits.slice(),
          };
        })
      );
    } catch (error) {
      deliveredChat.reject(error);
    }
  });
  await application.locator('#native-form').evaluate((form) => {
    form.addEventListener(
      'submit',
      () => void globalThis.fixtureOpenWaitingChat(),
      { once: true }
    );
  });
  const sent = await acceptSend(base, api);
  assert.equal(sent.delivery, 'provider-confirmed');
  const watchdog = new AbortController();
  return Promise.race([
    deliveredChat.promise,
    delay(5000, undefined, { signal: watchdog.signal }).then(() =>
      assert.fail('The fixture did not expose the chat on native send.')
    ),
  ]).finally(() => watchdog.abort());
};

export const verifyNativeApplicationChatWaiting = (
  browser,
  { screenshots, before = false } = {}
) =>
  withNativeApplicationChats(
    browser,
    async ({ fixture, chat, child, stats }) => {
      const controls = applicationPanelBrowser(fixture);
      const { batch, field, button, phase } = controls.batch();
      const api = applicationRouteApi(fixture.base, LINO_TEXT);
      const chromium = browser.browserType().name() === 'chromium';
      if (chromium) {
        await controls.select();
      } else {
        await controls.page.goto(`${fixture.base}/#/cv`);
        await controls.panel.waitFor();
        await controls.panel
          .locator('[data-application-option="autoSelectResumeLanguage"]')
          .uncheck();
      }
      await saveAnswerRule(fixture.store, {
        id: 'start-time',
        question: 'What time can you start?',
        answers: [{ text: 'At 9 a.m.', approved: true }],
      });
      await field('processChats').check();
      if (before) {
        assert.equal(await field('chatWatchWaiting').count(), 0);
      } else {
        await field('chatWatchWaiting').check();
        assert.equal(await field('chatsIntervalMinutes').inputValue(), '1');
      }
      await field('urls').fill('https://hh.ru/vacancy/123');
      await field('durationMs').fill('150');
      await field('maxApplications').fill('1');
      await field('confirmBatch').check();
      const original = (await stats()).waiting;
      await button('start').click();
      if (!chromium) {
        await batch
          .locator('[data-application-chats-phase="refused"]')
          .waitFor({ timeout: 60000 });
        assert.match(
          await batch.innerText(),
          /browser-background-focus-unavailable/u
        );
        const { batch: running } = await api.vacancyApplicationBatchStatus({});
        assert.equal(running.delivered, 0);
        if (running.active) {
          const stopped = await api.vacancyApplicationBatchStop({
            requestId: running.requestId,
            browserSlot: running.browserSlot,
          });
          assert.equal(stopped.batch.active, false);
        }
        if (!chat.isClosed()) {
          await chat.waitForEvent('close', { timeout: 10000 });
        }
        assert.deepEqual((await stats()).waiting, original);
        return { unsupportedFocusRefused: true, liveProvider: false };
      }
      const worker = await waitForFirstPass(child);
      assert.deepEqual((await stats()).waiting, original);
      await button('follow').click();
      await controls.panel
        .locator('[data-application-continuation="send"]')
        .waitFor({ timeout: 60000 });
      const application = nativeApplicationForm(browser);
      assert(application);
      const providerAfterDelivery = await submitWithWaitingChat({
        application,
        chat,
        base: fixture.base,
        api,
      });
      assert.equal(providerAfterDelivery.unread, 0);
      const shot = controls.screenshot(screenshots, 'application-chat-waiting');
      if (before) {
        await phase('completed');
        await batch
          .locator('[data-application-chats-phase="stopped"]')
          .waitFor();
        assert.equal(
          await batch.locator('[data-application-chats-held]').count(),
          0
        );
        assert.deepEqual(providerAfterDelivery.visits, []);
        await shot('before', batch);
        return { delivered: 1, chatReviewed: false, liveProvider: false };
      }
      await phase('chat-review');
      const skip = batch.locator('[data-application-chats-skip]');
      await skip.waitFor({ timeout: 45000 });
      const held = await api.vacancyApplicationBatchStatus({});
      assert.equal(held.batch.delivered, 1);
      assert.equal(held.batch.chatWorker.pid, worker.pid);
      assert.equal(held.batch.chatWorker.skip.chat, '8');
      assert.deepEqual((await stats()).waiting, {
        visits: ['8'],
        unread: 0,
        draft: 'At 9 a.m.',
        sends: 0,
      });
      await shot('after', batch);
      await skip.click();
      await batch.locator('[data-application-chats-skipped]').waitFor();
      await phase('completed');
      await batch.locator('[data-application-chats-phase="stopped"]').waitFor();
      assert(chat.isClosed());
      assert.throws(() => process.kill(worker.pid, 0), { code: 'ESRCH' });
      assert.equal(
        (await api.vacancyApplicationBatchStatus({})).batch.chatWorker.lastSkip
          .chat,
        '8'
      );
      assert.deepEqual(fixture.errors, []);
      return {
        delivered: 1,
        held: '8',
        skipConfirmed: true,
        chatSends: 0,
        liveProvider: false,
      };
    },
    { waiting: true }
  );
