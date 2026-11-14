import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
import {
  resumeMarkdown,
  githubLinks,
} from '../../experiments/issue-56/resume-profile-fixture.mjs';

test(
  'CLI file import and offline controls share the reviewed résumé Markdown draft',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-resume-profile-'));
    try {
      const file = path.join(dir, 'resume.md');
      await writeFile(file, resumeMarkdown);
      const lines = [];
      const cli = createAutomationCommands({ openStore: async () => store });
      const code = await cli.automations(
        {
          _: ['answers', 'profile'],
          'text-file': file,
          format: 'resume-markdown',
          json: true,
        },
        (line) => lines.push(line)
      );
      assert.equal(code, 0);
      const result = JSON.parse(lines.at(-1));
      assert.equal(result.profile.github, githubLinks);
      assert.equal(result.profile.birthDate, '1990-03-02');
      const offline = questionApi({
        store,
        remote: { report: async () => null },
      });
      assert.deepEqual(
        await offline.extractAnswerProfile({
          text: resumeMarkdown,
          format: 'resume-markdown',
        }),
        result
      );
      assert.deepEqual(await store.query(() => true), []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'text and binary Lino expose new résumé fields while preserving current profile overrides',
  { timeout: 15000 },
  async () => {
    const store = createMemoryStore();
    const server = await startServer({
      store,
      port: 0,
      telegramAccount: false,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
      log: null,
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/api/automations/answers/profile`,
          {
            method: 'POST',
            headers: { accept: type, 'content-type': type },
            body: encodeWire(
              {
                text: resumeMarkdown,
                format: 'resume-markdown',
                profile: { birthDate: '1991-01-01' },
              },
              type
            ),
          }
        );
        assert.equal(response.status, 200);
        const result = await readWireResponse(response);
        assert.equal(result.profile.github, githubLinks);
        assert.equal(result.profile.birthDate, '1991-01-01');
        assert.equal(
          result.fields.find((field) => field.key === 'birthDate').conflict,
          true
        );
        assert.equal(result.readOnly, true);
        assert.equal(result.requiresReview, true);
      }
      assert.deepEqual(await store.query(() => true), []);
    } finally {
      await server.close();
    }
  }
);
