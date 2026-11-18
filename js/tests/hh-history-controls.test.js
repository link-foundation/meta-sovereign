import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hhHistoryFixture } from '../../experiments/issue-56/hh-history-fixture.mjs';
import { importDownloadedFile } from '../src/sources/auto-import/files.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

test(
  'HH downloaded archive, CLI, offline UI and both Lino APIs retain one unapproved observed turn',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-hh-history-'));
    const store = createMemoryStore();
    const filePath = path.join(dir, 'hh-history.json');
    try {
      await writeFile(filePath, JSON.stringify(hhHistoryFixture()));
      const reports = await importDownloadedFile({
        store,
        provider: 'hh',
        filePath,
      });
      assert.equal(reports[0].imported, 4);
      assert.equal(reports[0].error, undefined);
      const commands = createAutomationCommands({
        openStore: async () => store,
      });
      const output = [];
      await commands.automations(
        { _: ['answers', 'learn'], json: true },
        (line) => output.push(line)
      );
      const cli = JSON.parse(output[0]);
      assert.equal(cli.rules[0].answers[0].count, 1);
      const offline = questionApi({
        store,
        remote: { get: async () => null, report: async () => null },
      });
      const preview = await offline.learnAnswers({});
      assert.deepEqual(preview.rules, cli.rules);
      assert.equal(
        (await store.query((link) => link.id.startsWith('qa-rule:'))).length,
        0
      );
      const server = await startServer({
        store,
        storeDir: dir,
        enableSync: false,
        enableHandlers: false,
        telegramAccount: false,
        automations: { scheduler: false },
      });
      try {
        for (const type of [LINO_TEXT, LINO_BINARY]) {
          const uploaded = await fetch(
            `http://127.0.0.1:${server.port}/api/archive/upload?source=hh&name=hh-history.json`,
            {
              method: 'POST',
              headers: {
                accept: type,
                'content-type': 'application/octet-stream',
              },
              body: JSON.stringify(hhHistoryFixture()),
            }
          );
          assert.equal(uploaded.status, 200);
          const report = await readWireResponse(uploaded);
          assert.equal(report.imported, 4);
          const learned = await fetch(
            `http://127.0.0.1:${server.port}/api/automations/answers/learn`,
            {
              method: 'POST',
              headers: { accept: type, 'content-type': type },
              body: encodeWire({ apply: true }, type),
            }
          );
          assert.equal(learned.status, 200);
          const result = await readWireResponse(learned);
          assert.equal(result.rules[0].answers[0].count, 1);
          assert.equal(result.rules[0].answers[0].approved, false);
          assert.deepEqual(result.rules[0].answers[0].evidence, [
            'msg:hh:56002',
          ]);
        }
        const invalid = hhHistoryFixture();
        delete invalid.negotiations[0].messages.items[1].id;
        const rejected = await fetch(
          `http://127.0.0.1:${server.port}/api/archive/upload?source=hh&name=hh-refused.json`,
          {
            method: 'POST',
            headers: {
              accept: LINO_TEXT,
              'content-type': 'application/octet-stream',
            },
            body: JSON.stringify(invalid),
          }
        );
        assert.equal(rejected.status, 400);
        assert.equal((await readWireResponse(rejected)).imported, 0);
        assert.equal(
          (await store.query((link) => link.id.startsWith('msg:hh:'))).length,
          4
        );
      } finally {
        await server.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);
