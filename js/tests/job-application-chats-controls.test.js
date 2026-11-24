import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  applicationChatsFixture,
  untilApplicationChats,
} from '../../experiments/issue-56/application-chats-fixture.mjs';
import {
  batchInput,
  batchUrls,
} from '../../experiments/issue-56/application-batch-fixture.mjs';
import {
  withApplicationRouteFixture,
  applicationPanelMarkup,
  assertApplicationLocaleMarkup,
} from './helpers/application-controls.mjs';
import { createApplicationCommands } from '../src/cli/application-command.js';
import { applicationBatchKey } from '../src/jobs/application-batch-data.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { ApplicationChatControls } from '../src/web/application-chat-controls.js';
import { translate } from '../src/web/i18n.js';
import { wirePost } from './helpers/vacancy-routes.mjs';

const options = { timeout: 15000 };
const waitingChatFixture = (t) => {
  const passId = `question-unread:${randomUUID()}`;
  const target = { passId, chat: '8', questionId: '807' };
  const skips = [];
  const unread = (id) => ({
    id,
    state: 'active',
    owned: true,
    watchWaiting: true,
    polling: {
      phase: 'waiting',
      passes: skips.length + 1,
      lastPassId: passId,
      receiptPassId: passId,
      lastSkip: skips.at(-1),
    },
    restoration: skips.length
      ? { restored: true }
      : {
          heldReview: {
            chat: target.chat,
            questionId: target.questionId,
            currentQuestionId: target.questionId,
          },
        },
  });
  const f = applicationChatsFixture(t, {
    questionPolling: {
      unreadStatus: async ({ id }) => unread(id),
      unreadSkip: async ({ id, ...selected }) => {
        assert.deepEqual(selected, target);
        skips.push(selected);
        return unread(id);
      },
    },
  });
  return { f, target, skips };
};

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `application-owned chat intent and child receipts survive ${type} production API transport`,
    options,
    async (t) => {
      const f = applicationChatsFixture(t);
      await withApplicationRouteFixture(f, type, async (api) => {
        await api.vacancyApplicationBatchStart({
          ...batchInput,
          processChats: true,
          chatPrefillForms: true,
          confirmations: ['send'],
        });
        const local = await untilApplicationChats(
          () => api.vacancyApplicationBatchStatus(batchInput),
          (row) =>
            row.batch?.chatWorker?.phase === 'running' &&
            row.batch.chatWorker.held
        );
        const receipt = await api.vacancyApplicationBatchStatus(batchInput);
        assert.equal(receipt.batch.chatWorker.pid, local.batch.chatWorker.pid);
        assert.equal(receipt.batch.settings.chatsIntervalMinutes, 120);
        assert.equal(receipt.batch.settings.chatBrowserSlot, 'chat-slot');
        assert.equal(receipt.batch.settings.chatPrefillForms, true);
        assert.equal(f.calls.start[0].prefillForms, true);
        const stopped = await api.vacancyApplicationBatchStop(batchInput);
        assert.equal(stopped.batch.chatWorker.phase, 'stopped');
        assert.equal(stopped.batch.chatWorker.active, false);
      });
    }
  );
  test(
    `the exact application chat Skip is acknowledged and recovered through ${type}`,
    options,
    async (t) => {
      const { f, target, skips } = waitingChatFixture(t);
      await withApplicationRouteFixture(f, type, async (api, base) => {
        await api.vacancyApplicationBatchStart({
          ...batchInput,
          processChats: true,
          chatWatchWaiting: true,
          confirmations: ['send'],
        });
        const {
          batch: { chatWorker },
        } = await untilApplicationChats(
          () => api.vacancyApplicationBatchStatus(batchInput),
          (row) => row.batch?.chatWorker?.skip
        );
        const input = {
          requestId: batchInput.requestId,
          browserSlot: 'jobs',
          chatReview: chatWorker.skip,
        };
        const refused = await wirePost(
          base,
          'application-batch-chat-skip',
          input,
          type,
          {
            origin: 'https://untrusted.test',
          }
        );
        assert.equal(refused.status, 403);
        assert.deepEqual(skips, []);
        const stale = await f.worker().browser.unreadStatus(chatWorker.skip);
        const accepted = await api.vacancyApplicationBatchChatSkip(input);
        assert.deepEqual(accepted.batch.chatWorker.lastSkip, target);
        f.worker().observe(stale);
        assert.equal(f.worker().status().skip, null);
        const stopped = await api.vacancyApplicationBatchStop(batchInput);
        assert.deepEqual(
          stopped.batch.chatWorker.lastSkip,
          accepted.batch.chatWorker.lastSkip
        );
        const recovered = await api.vacancyApplicationBatchChatSkip(input);
        assert.deepEqual(
          recovered.batch.chatWorker.lastSkip,
          accepted.batch.chatWorker.lastSkip
        );
        assert.deepEqual(skips, [target]);
      });
    }
  );
}

test(
  'batch console s skips only the question shown by status',
  options,
  async (t) => {
    const { f, target, skips } = waitingChatFixture(t);
    const directory = await mkdtemp(
      join(tmpdir(), 'application-chat-console-')
    );
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, 'vacancies.txt');
    await writeFile(file, batchUrls.join('\n'));
    const output = [];
    const commands = createApplicationCommands({
      ...f.serviceOptions,
      openStore: async () => f.store,
      async *applicationInput() {
        await untilApplicationChats(
          () => f.worker()?.status(),
          (view) => view?.skip
        );
        yield 's';
        assert.equal(output.at(-1).code, 'jobs-application-chats-skip-changed');
        assert.deepEqual(skips, []);
        yield 'status';
        const receipt = output.at(-1).batch;
        assert.equal(
          receipt.chatWorker.skip?.chat,
          target.chat,
          JSON.stringify(receipt)
        );
        yield 's';
        assert.deepEqual(output.at(-1).batch.chatWorker.lastSkip, target);
        yield 'stop';
      },
    });
    const code = await commands['vacancies-application-batch'](
      {
        'vacancies-file': file,
        'request-id': batchInput.requestId,
        'process-chats': 'true',
        'chat-watch-waiting': 'true',
        'no-auto-select-resume-language': 'true',
        confirm: 'send',
      },
      (value) => output.push(decodeWire(value))
    );
    assert.equal(code, 0);
    assert.deepEqual(skips, [target]);
    assert.equal(output.at(-1).batch.chatWorker.phase, 'stopped');
  }
);

test(
  'the registered CLI preserves chat flags and preview starts no child',
  options,
  async (t) => {
    const f = applicationChatsFixture(t);
    const directory = await mkdtemp(join(tmpdir(), 'application-chats-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, 'vacancies.txt');
    await writeFile(file, batchUrls.join('\n'));
    const commands = createApplicationCommands({
      ...f.serviceOptions,
      openStore: async () => f.store,
      async *applicationInput() {
        yield 'status';
      },
    });
    const output = [];
    const code = await commands['vacancies-application-batch'](
      {
        'vacancies-file': file,
        'request-id': batchInput.requestId,
        'process-chats': 'true',
        'chat-model-draft': 'true',
        'chat-prefill-forms': 'true',
        'chat-watch-waiting': 'true',
        'chats-interval-minutes': '9',
        'chat-browser-slot': 'recruiter-chats',
        'test-mode': 'true',
      },
      (value) => output.push(decodeWire(value))
    );
    assert.equal(code, 0);
    const record = await f.store.get(applicationBatchKey(batchInput).id);
    assert.equal(record.options.processChats, true);
    assert.equal(record.options.chatModelDraft, true);
    assert.equal(record.options.chatPrefillForms, true);
    assert.equal(record.options.chatWatchWaiting, true);
    assert.equal(record.options.chatsIntervalMinutes, 9);
    assert.equal(record.options.chatBrowserSlot, 'recruiter-chats');
    assert.equal(f.calls.children.length, 0);
    assert(output.some((row) => row.batch?.chatWorker?.phase === 'preview'));
    for (const operation of [
      'application',
      'application-status',
      'application-batch-status',
    ]) {
      await assert.rejects(
        () =>
          commands[`vacancies-${operation}`](
            { 'process-chats': true },
            () => {}
          ),
        /Chat worker settings require vacancies application-batch/u
      );
    }
  }
);

test(
  'shared application controls expose localized separate chat intent, frozen settings and held review',
  options,
  async (t) => {
    const f = applicationChatsFixture(t);
    await f.start({ processChats: true, confirmations: ['send'] });
    const receipt = await f.ready();
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      const markup = applicationPanelMarkup(
        { options: {}, batch: { receipt, known: true } },
        locale
      );
      assertApplicationLocaleMarkup(markup, locale, [
        'chats.enable',
        'chats.hint',
      ]);
      assert.match(
        markup,
        /<input[^>]*disabled=""[^>]*data-application-batch-field="processChats"/u
      );
      assert(markup.includes(f.held.title));
      assert(markup.includes(f.held.url));
      const controls = renderToStaticMarkup(
        React.createElement(ApplicationChatControls, {
          draft: {
            processChats: true,
            chatModelDraft: false,
            chatPrefillForms: true,
            chatsIntervalMinutes: 120,
            chatBrowserSlot: 'chat-slot',
          },
          frozen: true,
          update: () => {},
          t: (key, values) => translate(locale, key, values),
        })
      );
      assert.match(
        controls,
        /data-application-batch-field="chatsIntervalMinutes"[^>]*value="120"/u
      );
      assert.match(controls, /data-model-draft-opt-in=""/u);
      assert.match(
        controls,
        /data-application-batch-field="chatPrefillForms"[^>]*checked=""/u
      );
      assert(!controls.includes('application.chats.'));
    }
  }
);
