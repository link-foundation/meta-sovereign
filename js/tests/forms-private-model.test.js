import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import {
  privateModelFixture,
  privateModelMarkdown,
} from '../../experiments/issue-56/forms-private-model-fixture.mjs';
import { modelText } from '../../experiments/issue-56/forms-model-fixture.mjs';
import {
  saveAnswerModel,
  readAnswerModel,
} from '../src/automation/answer-model-config.js';
import { prepareAnswerPreview } from '../src/automation/question-store.js';
import { prepareAnswerModelContext } from '../src/automation/answer-model-context.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

const limits = { timeout: 10000 };

const draftFromPrivateCv = async (input) => {
  const prompt = JSON.parse(input.prompt);
  assert.equal(prompt.context.cv?.values.markdown, privateModelMarkdown);
  return {
    drafts: prompt.questions.map(({ id }) => ({
      id,
      text: modelText,
      missing: [],
      evidence: ['resume/resume.md'],
    })),
  };
};

test(
  'optional form model drafts receive the conventional full resume without saving a CV',
  limits,
  () =>
    privateModelFixture(async (env) => {
      const plan = await env.plan();
      const cv = env.calls[0].context.cv;
      assert.deepEqual(cv, {
        id: 'resume/resume.md',
        values: { markdown: privateModelMarkdown },
      });
      assert.equal(plan.fields[0].answer.proposal?.value, modelText);
      assert.deepEqual(plan.fields[0].answer.evidence, ['resume/resume.md']);
      assert(!JSON.stringify(plan).includes(privateModelMarkdown));
      assert(!JSON.stringify(plan).includes(env.directory));
      assert.equal((await readAnswerModel(env.store)).cvId, '');
      assert.equal(
        (await env.store.query()).filter((item) => item.id.startsWith('cv:'))
          .length,
        0
      );
      const applied = await env.apply(plan);
      assert.equal(applied.state, 'applied');
      assert.equal(env.writes, 1);
      assert.equal(env.calls.length, 1);
      assert.deepEqual(await env.apply(plan), applied);
      assert.equal(env.writes, 1);
    })
);

test(
  'changed or deleted private resume invalidates an issued model proposal before a write',
  limits,
  () =>
    privateModelFixture(async (env) => {
      for (const mode of ['changed', 'deleted']) {
        await writeFile(env.file, privateModelMarkdown);
        const plan = await env.plan();
        assert.equal(plan.fields[0].answer.proposal?.value, modelText);
        if (mode === 'changed') {
          await writeFile(
            env.file,
            `${privateModelMarkdown}\nChanged experience.\n`
          );
        } else {
          await rm(env.file);
        }
        const result = await env.apply(plan);
        assert.equal(result.state, 'refused');
        assert.equal(result.code, 'form-answers-changed');
        assert.equal(env.writes, 0);
      }
      assert.equal(env.calls.length, 2);
    })
);

test(
  'explicit stored CV remains preferred and a missing selected CV never falls back silently',
  limits,
  () =>
    privateModelFixture(async (env) => {
      await env.store.put({
        id: 'cv:selected',
        cv: { basics: { summary: 'Explicit owner CV' } },
      });
      await saveAnswerModel(env.store, {
        ...(await readAnswerModel(env.store)),
        cvId: 'cv:selected',
      });
      const plan = await env.plan();
      assert.equal(plan.fields[0].answer.source, 'model');
      assert.equal(env.calls[0].context.cv.id, 'cv:selected');
      assert(
        !JSON.stringify(env.calls[0].context.cv).includes(privateModelMarkdown)
      );
      await env.store.delete('cv:selected');
      await assert.rejects(env.plan(), { code: 'answer-model-cv' });
      assert.equal(env.calls.length, 1);
    })
);

test(
  'private resume model context retains opt-in, disabled state and unknown-fact review',
  limits,
  () =>
    privateModelFixture(async (env) => {
      await env.plan({ modelDraft: false });
      assert.equal(env.calls.length, 0);
      await saveAnswerModel(env.store, {
        ...(await readAnswerModel(env.store)),
        enabled: false,
      });
      const disabled = await env.plan();
      assert.equal(disabled.planning.model.state, 'disabled');
      assert.equal(env.calls.length, 0);
      await saveAnswerModel(env.store, {
        ...(await readAnswerModel(env.store)),
        enabled: true,
      });
      env.report.fields[0].label = 'Starting date for this vacancy?';
      const unknown = await env.plan();
      assert.equal(env.calls[0].context.cv?.id, 'resume/resume.md');
      assert.equal(unknown.fields[0].answer.reason, 'model-clarification');
      assert.equal(unknown.fields[0].answer.proposal, null);
      assert(unknown.fields[0].answer.missing.length);
      assert.equal(env.writes, 0);
    })
);

test(
  'form-only resume fallback leaves generic model preparation and its context bound intact',
  limits,
  () =>
    privateModelFixture(async (env) => {
      const generic = await prepareAnswerPreview(env.store, {});
      assert.equal(
        (
          await prepareAnswerModelContext(env.store, generic.context, [
            'Background',
          ])
        ).knowledge.cv,
        null
      );
      await writeFile(env.file, `# Example\n${'é'.repeat(55000)}`);
      await assert.rejects(env.plan(), { code: 'answer-model-context' });
      assert.equal(env.calls.length, 0);
    })
);

test(
  'forms-plan CLI passes the private CV to its explicitly enabled model',
  limits,
  () =>
    privateModelFixture(async (env) => {
      const output = [];
      const file = `${env.directory}/inspection.json`;
      await writeFile(file, JSON.stringify(env.report));
      const commands = createFormsCommands({
        openStore: async () => env.store,
        reportWriter: null,
        modelRunner: draftFromPrivateCv,
      });
      await commands['forms-plan']({ file, 'model-draft': true }, (line) =>
        output.push(JSON.parse(line))
      );
      assert.equal(output[0].fields[0].answer.proposal?.value, modelText);
    })
);

for (const media of [LINO_TEXT, LINO_BINARY]) {
  test(
    `private resume model planning uses trusted ${media} without request-selected paths`,
    limits,
    () =>
      privateModelFixture(async (env) => {
        const server = await startServer({
          store: env.store,
          port: 0,
          localUi: false,
          enableSync: false,
          enableHandlers: false,
          telegramAccount: false,
          automations: { scheduler: false },
          log: null,
          answerModel: {
            draft: draftFromPrivateCv,
            stop: async () => {},
          },
        });
        try {
          const response = await fetch(
            `http://127.0.0.1:${server.port}/api/forms/plan`,
            {
              method: 'POST',
              headers: { 'content-type': media, accept: media },
              body: encodeWire(
                {
                  inspection: env.report,
                  modelDraft: true,
                  directory: 'ignored',
                  cvPath: 'ignored',
                },
                media
              ),
            }
          );
          const result = await readWireResponse(response);
          assert.equal(result.fields[0].answer.proposal?.value, modelText);
          assert(!JSON.stringify(result).includes(env.directory));
        } finally {
          await server.close();
        }
      })
  );
}
