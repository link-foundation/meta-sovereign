import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { unreadBotQuestion } from '../../../experiments/issue-56/chat-navigation-fixture.mjs';
import { withNativeApplicationChats } from './application-chats-browser-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { applicationRouteApi } from './application-controls.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { LINO_TEXT } from '../../src/transport/lino.js';

const stopApplicationChatBatch = async ({ page, button, batch, api, logs }) => {
  const path = '/api/vacancies/application-batch-stop';
  try {
    const [response] = await Promise.all([
      page.waitForResponse(
        (entry) =>
          new URL(entry.url()).pathname === path &&
          entry.request().method() === 'POST',
        { timeout: 15000 }
      ),
      button('stop').click(),
    ]);
    assert.equal(response.status(), 200);
    await batch.locator('[data-application-chats-phase="stopped"]').waitFor();
  } catch (error) {
    const status = await api.vacancyApplicationBatchStatus({});
    console.error('[application-chat-stop]', {
      phase: status.batch.phase,
      worker: status.batch.chatWorker.phase,
      code: status.batch.chatWorker.code ?? status.batch.code,
      events: logs.slice(-12).map(({ event, code }) => ({ event, code })),
    });
    throw error;
  }
};

/** Actual child + two native provider fixtures; every account and delivery is synthetic. */
export const verifyNativeApplicationChats = async (
  browser,
  {
    screenshots,
    before = false,
    choices = false,
    parentChoice = false,
    session = false,
    parentSession = false,
  } = {}
) =>
  withNativeApplicationChats(
    browser,
    async ({ fixture, chat, logs, stats }) => {
      const controls = applicationPanelBrowser(fixture);
      const batch = controls.panel.locator('[data-application-batch]');
      const field = (name) =>
        batch.locator(`[data-application-batch-field="${name}"]`);
      const button = (name) =>
        batch.locator(`[data-application-batch-action="${name}"]`);
      const api = applicationRouteApi(fixture.base, LINO_TEXT);
      const shot = controls.screenshot(
        screenshots,
        choices
          ? 'application-chat-choices'
          : session
            ? 'application-chat-session'
            : 'application-chats'
      );
      const verifiesFocus = browser.browserType().name() === 'chromium';
      if (choices && !verifiesFocus) {
        await controls.page.goto(`${fixture.base}/#/cv`);
        await controls.panel.waitFor();
      } else {
        await controls.select();
      }
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
      if (choices) {
        await saveAnswerRule(fixture.store, {
          id: 'application-bot-question',
          question: unreadBotQuestion,
          answers: [{ text: 'Yes', approved: true }],
        });
      }
      assert.equal(await field('processChats').isChecked(), false);
      await field('processChats').check();
      assert.equal(await field('chatsIntervalMinutes').inputValue(), '120');
      assert.equal(await field('chatBrowserSlot').inputValue(), 'chat-slot');
      assert.equal(
        await batch.locator('[data-model-draft-opt-in]').isChecked(),
        false
      );
      await controls.panel
        .locator('[data-application-option="pacing"]')
        .check();
      await controls.panel
        .locator('[data-application-pacing-interval]')
        .fill('2');
      await field('urls').fill(
        'https://hh.ru/vacancy/123\nhttps://hh.ru/vacancy/456'
      );
      await field('durationMs').fill('180');
      await field('confirmBatch').check();
      const original = verifiesFocus ? null : (await stats()).chat;
      await button('start').click();
      if (parentSession) {
        await batch
          .locator('[data-application-chats-phase="refused"]')
          .waitFor({ timeout: 60000 });
        assert.match(await batch.innerText(), /login-required/u);
        await button('follow').click();
        await controls.panel
          .locator('[data-application-continuation="send"]')
          .waitFor({ timeout: 60000 });
        assert.equal(chat.url(), 'https://hh.ru/account/login');
        assert.equal(
          await chat.locator('h1').innerText(),
          'Synthetic HeadHunter sign-in'
        );
        assert.equal((await stats()).chat, null);
        await shot('before');
        if (screenshots) {
          await chat.screenshot({
            path: join(
              screenshots,
              'application-chat-session-native-before.png'
            ),
          });
        }
        await button('stop').click();
        await batch
          .locator('[data-application-batch-phase="stopped"]')
          .waitFor();
        return {
          loginRequired: true,
          applicationContinued: true,
          liveProvider: false,
        };
      }
      if (!verifiesFocus) {
        await batch
          .locator('[data-application-chats-phase="refused"]')
          .waitFor({ timeout: 60000 });
        assert.match(
          await batch.innerText(),
          /browser-background-focus-unavailable/u
        );
        assert.deepEqual((await stats()).chat, original);
        const status = await api.vacancyApplicationBatchStatus({});
        if (status.batch.active) {
          await api.vacancyApplicationBatchStop({
            requestId: status.batch.requestId,
            browserSlot: status.batch.browserSlot,
          });
        }
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
      const heldChat = parentChoice ? '9' : '8';
      assert.equal(receipt.batch.chatWorker.held.chat, heldChat);
      if (session) {
        assert.deepEqual(
          logs.filter(
            (row) => row.event === 'application-chats-session-reused'
          ),
          [
            {
              event: 'application-chats-session-reused',
              browserSlot: 'chat-slot',
            },
          ]
        );
      }
      assert.deepEqual((await stats()).chat, {
        draft: choices && !parentChoice ? '' : 'At 9 a.m.',
        sends: parentChoice ? 1 : 0,
        unreadNext: parentChoice ? 0 : 1,
      });
      if (choices && !parentChoice) {
        assert.deepEqual(
          await chat.locator('#choices button').allTextContents(),
          ['Yes', 'No']
        );
      }
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
      await shot(parentChoice ? 'before' : 'after');
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await chat.screenshot({
          path: join(
            screenshots,
            choices
              ? `application-chat-choices-native-${parentChoice ? 'before' : 'after'}.png`
              : session
                ? 'application-chat-session-native-after.png'
                : 'application-chats-native-draft.png'
          ),
          fullPage: true,
        });
      }
      if (!parentChoice) {
        await controls.locales('[data-application-chats-held]');
        await controls.phone();
        await shot('phone');
      }
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
      assert.equal(next.batch.chatWorker.held.chat, heldChat);
      await stopApplicationChatBatch({
        page: controls.page,
        button,
        batch,
        api,
        logs,
      });
      assert(chat.isClosed(), 'Stop must close the owned chat context');
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
      assert(
        logs.some(
          (row) =>
            row.event === 'application-chats-review-held' &&
            row.url === `https://hh.ru/chat/${heldChat}`
        )
      );
      assert.deepEqual(fixture.errors, []);
      return {
        cases: 1,
        ...(session ? { sessionReused: true } : {}),
        actualChild: true,
        independentNativeBrowsers: true,
        applicationDeliveries: 1,
        chatSends: parentChoice ? 1 : 0,
        childDrained: true,
        liveProvider: false,
      };
    },
    { choices, session }
  );

export const verifyNativeApplicationChoiceHold = (browser) =>
  verifyNativeApplicationChats(browser, {
    choices: true,
    parentChoice: process.env.APPLICATION_CHAT_CHOICES_BEFORE === '1',
    screenshots: process.env.APPLICATION_SCREENSHOTS,
  });

export const verifyNativeApplicationChatSession = (browser) =>
  verifyNativeApplicationChats(browser, {
    session: true,
    parentSession: process.env.APPLICATION_CHAT_SESSION_BEFORE === '1',
    screenshots: process.env.APPLICATION_SCREENSHOTS,
  });
