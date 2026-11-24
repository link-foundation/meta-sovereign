import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { withUnreadModel } from '../../experiments/issue-56/unread-model-fixture.mjs';
import { listOutbox } from '../src/automation/outbox.js';

for (const scenario of [
  { name: 'saved automation', saved: true, calls: 1 },
  { name: 'configuration file', calls: 1 },
  { name: 'explicit model opt-out', saved: true, optOut: true, calls: 0 },
  { name: 'inspection only', inspection: true, calls: 0 },
  { name: 'injected runner', saved: true, injected: true, calls: 1 },
]) {
  test(
    `CLI unread model lifecycle honors ${scenario.name}`,
    { timeout: 10000 },
    (t) =>
      withUnreadModel(async (env) => {
        const directory = await mkdtemp(join(tmpdir(), 'unread-cli-model-'));
        t.after(() => rm(directory, { recursive: true, force: true }));
        const action = {
          kind: 'answer-questions',
          modelDraft: true,
          approximate: false,
          profileId: env.seed.profile.id,
        };
        let settings;
        if (scenario.saved) {
          await env.store.put({ id: 'automation:unread-model', action });
          settings = { automation: 'unread-model' };
        } else {
          const file = join(directory, 'answers.json');
          await writeFile(file, JSON.stringify({ action }));
          settings = { config: file };
        }
        let created = 0;
        let stopped = 0;
        const cli = createAutomationCommands({
          openStore: async () => env.store,
          send: env.send,
          modelRunner: scenario.injected ? env.runner : undefined,
          createAnswerModel: () => {
            created++;
            return {
              draft: env.runner,
              stop: async () => {
                stopped++;
              },
            };
          },
        });
        const output = [];
        const code = await cli.automations(
          {
            _: ['answers', 'browser', 'unread'],
            json: true,
            now: env.state.now.toISOString(),
            source: 'hh',
            confirm: true,
            'pass-id': env.input.id,
            'answer-chats': !scenario.inspection,
            ...settings,
            ...(scenario.optOut ? { 'model-draft': false } : {}),
          },
          (line) => output.push(line)
        );
        assert.equal(code, 0, output.at(-1));
        const result = JSON.parse(output.at(-1));
        if (scenario.calls) {
          assert.equal(result.entries[0].answer.phase, 'prefilled');
        }
        assert.equal(env.calls.length, scenario.calls);
        assert.equal(env.state.prefills.length, scenario.calls);
        assert.equal(created, scenario.injected ? 0 : 1);
        assert.equal(
          stopped,
          created,
          'owned model must drain before CLI return'
        );
        assert.equal(env.state.sends.length, 0);
        assert.deepEqual(await listOutbox(env.store), []);
      })
  );
}
