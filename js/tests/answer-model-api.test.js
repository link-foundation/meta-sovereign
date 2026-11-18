import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { questionCommands } from '../src/cli/question-commands.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import {
  formModelField as field,
  formModelInspection as inspection,
} from './helpers/forms-plan-inspection.mjs';
import {
  seedModelAnswers,
  modelRunnerFixture,
  modelQuestion,
  modelText,
} from '../../experiments/issue-56/forms-model-fixture.mjs';

test(
  'both Lino transports share trusted revisioned model settings and the real server planning adapter',
  { timeout: 10000 },
  async () => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const store = createMemoryStore();
      const { settings } = await seedModelAnswers(store);
      const calls = [];
      const { server, base } = await formReviewHttp(
        {
          store,
          answerModel: {
            draft: modelRunnerFixture(calls),
            stop: async () => {},
          },
        },
        media
      );
      const request = async (path, body, headers = {}) => {
        const response = await fetch(
          `${base}/api/automations/answers/${path}`,
          {
            method: 'POST',
            headers: { accept: media, 'content-type': media, ...headers },
            body: encodeWire(body, media),
          }
        );
        return {
          status: response.status,
          body: await readWireResponse(response),
        };
      };
      try {
        const input = { ...settings, model: 'sonnet' };
        assert.equal(
          (
            await request('model', input, {
              origin: 'https://untrusted.example',
            })
          ).status,
          403
        );
        const saved = await request('model', input);
        assert.equal(saved.status, 200);
        assert.equal(saved.body.settings.model, 'sonnet');
        const stale = await request('model', input);
        assert.equal(stale.status, 409);
        assert.equal(stale.body.code, 'answer-model-changed');
        const planned = await request('plan', {
          question: modelQuestion,
          approximate: false,
          modelDraft: true,
        });
        assert.equal(planned.body.match, 'model');
        assert.equal(planned.body.text, modelText);
        assert.equal(calls.length, 1);
        assert.equal(
          (
            await request(
              'plan',
              { question: modelQuestion, modelDraft: true },
              { origin: 'https://untrusted.example' }
            )
          ).status,
          403
        );
        assert.equal(calls.length, 1);
      } finally {
        await server.close();
      }
    }
  }
);

test(
  'CLI saves explicit model configuration and opts into a batch plan without changing deterministic answers',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const { settings, profile } = await seedModelAnswers(store);
    const logs = [];
    await questionCommands({
      store,
      log: (value) => logs.push(JSON.parse(value)),
      args: {
        _: ['answers', 'model', 'save'],
        enabled: true,
        cv: 'cv:model-fixture',
        model: 'sonnet',
        revision: settings.revision,
        json: true,
      },
    });
    assert.equal(logs[0].settings.model, 'sonnet');
    const directory = await mkdtemp(join(tmpdir(), 'ms-model-plan-'));
    const calls = [];
    try {
      const file = join(directory, 'inspection.json');
      await writeFile(file, JSON.stringify(inspection([field(modelQuestion)])));
      const commands = createFormsCommands({
        openStore: async () => store,
        reportWriter: null,
        modelRunner: modelRunnerFixture(calls),
      });
      await commands['forms-plan'](
        {
          file,
          'profile-id': profile.id,
          'model-draft': true,
          approximate: false,
          format: 'json',
        },
        (value) => logs.push(JSON.parse(value))
      );
      assert.equal(logs.at(-1).fields[0].answer.source, 'model');
      assert.equal(calls.length, 1);
      await assert.rejects(
        commands['forms-plan']({ file, 'model-draft': 'invalid' }, () => {}),
        /must be true or false/u
      );
      await assert.rejects(
        questionCommands({
          store,
          log: () => {},
          args: { _: ['answers', 'model', 'save'], enabled: true },
        }),
        /revision/u
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);
