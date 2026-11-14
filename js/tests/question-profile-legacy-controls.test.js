import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { questionApi } from '../src/web/question-api.js';
import { startServer } from '../src/server/index.js';
import { saveAnswerProfile } from '../src/automation/question-profiles.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

const text =
  'email\n  legacy@example.test\ngithub\n  github.com/example\n  github.com/example-org\n';

test(
  'actual CLI and offline controls produce read-only drafts against current profile values',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const saved = await saveAnswerProfile(store, {
      id: 'owner',
      name: 'Owner',
      values: { email: 'current@example.test' },
    });
    const before = globalThis.structuredClone(await store.query(() => true));
    const dir = await mkdtemp(path.join(os.tmpdir(), 'legacy-contacts-'));
    try {
      const file = path.join(dir, 'contacts.lino');
      await writeFile(file, text);
      const cli = createAutomationCommands({ openStore: async () => store });
      const run = async (args) => {
        const output = [];
        const status = await cli.automations({ ...args, json: true }, (line) =>
          output.push(line)
        );
        if (status === 1) {
          throw new Error(output.join('\n'));
        }
        return JSON.parse(output.at(-1));
      };
      const result = await run({
        _: ['answers', 'profiles', 'import', 'owner'],
        file,
      });
      assert.equal(result.readOnly, true);
      assert.equal(result.target.revision, saved.revision);
      assert.equal(result.profile.email, 'current@example.test');
      assert.equal(result.fields[0].conflict, true);
      assert.equal(
        result.profile.github,
        'github.com/example\ngithub.com/example-org'
      );
      const plain = await run({
        _: ['answers', 'profile'],
        'text-file': file,
        format: 'contacts-lino',
      });
      assert.equal(plain.profile.email, 'legacy@example.test');
      const offline = questionApi({
        store,
        remote: { get: async () => null, post: async () => null },
      });
      assert.equal(
        (await offline.extractAnswerProfile({ text, format: 'contacts-lino' }))
          .profile.github,
        plain.profile.github
      );
      await assert.rejects(
        run({ _: ['answers', 'profiles', 'import'] }),
        /requires --file/u
      );
      await writeFile(file, 'x'.repeat(256001));
      await assert.rejects(
        run({ _: ['answers', 'profiles', 'import'], file }),
        /256000/u
      );
      assert.deepEqual(await store.query(() => true), before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'the existing text/binary Lino extraction route shares legacy parsing and refusal behavior',
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
    });
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const post = async (input) => {
          const response = await fetch(
            `http://127.0.0.1:${server.port}/api/automations/answers/profile`,
            {
              method: 'POST',
              headers: { accept: type, 'content-type': type },
              body: encodeWire(input, type),
            }
          );
          return {
            status: response.status,
            body: await readWireResponse(response),
          };
        };
        const result = await post({ text, format: 'contacts-lino' });
        assert.equal(result.status, 200);
        assert.equal(result.body.readOnly, true);
        assert.equal(result.body.profile.email, 'legacy@example.test');
        const malformed = await post({
          text: 'name\n  "secret-marker',
          format: 'contacts-lino',
        });
        assert.equal(malformed.status, 400);
        assert.equal(malformed.body.error.includes('secret-marker'), false);
      }
      assert.deepEqual(
        await store.query((link) => link.id.startsWith('qa-profile:')),
        []
      );
    } finally {
      await server.close();
    }
  }
);
