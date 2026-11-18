import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
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

const options = { timeout: 15000 };
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
        const stopped = await api.vacancyApplicationBatchStop(batchInput);
        assert.equal(stopped.batch.chatWorker.phase, 'stopped');
        assert.equal(stopped.batch.chatWorker.active, false);
      });
    }
  );
}

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
      assert(!controls.includes('application.chats.'));
    }
  }
);
