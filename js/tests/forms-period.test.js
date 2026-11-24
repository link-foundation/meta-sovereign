import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { automaticFormEnvironment } from './helpers/forms-auto-prefill-fixture.mjs';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { readAnswerPolicy } from '../src/automation/question-policy.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';

const prepare = async (t) => {
  const env = await automaticFormEnvironment(1);
  const store = env.options.store;
  t.after(async () => {
    await env.reader.stop();
    await store.close?.();
  });
  env.report.fields[0].label = 'Where do you live?';
  await saveAnswerRule(store, {
    id: 'form-period',
    question: env.report.fields[0].label,
    answers: ['Vietnam', 'Vietnam.'].map((text, i) => ({
      text,
      count: i ? 1 : 4,
      approved: true,
    })),
  });
  return { ...env, store };
};
const configuration = async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ms-form-period-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'form.lenv');
  await writeFile(file, 'ANSWER_FINAL_PERIOD: without\n');
  return { dir, file };
};

test(
  'form CLI plans resolve isolated settings and reject invalid values before opening a store',
  { timeout: 10000 },
  async (t) => {
    const env = await prepare(t);
    const config = await configuration(t);
    const file = join(config.dir, 'inspection.json');
    await writeFile(file, JSON.stringify(env.report));
    let opens = 0;
    const cli = createFormsCommands({
      reportWriter: null,
      openStore: async () => {
        opens++;
        return env.store;
      },
    });
    const output = [];
    const args = { file, configuration: config.file };
    assert.equal(
      await cli['forms-plan'](args, (line) => output.push(JSON.parse(line))),
      0
    );
    assert.equal(output[0].fields[0].answer.text, 'Vietnam');
    assert.equal(output[0].fields[0].answer.count, 5);
    await assert.rejects(
      cli['forms-plan'](
        { ...args, 'answer-final-period': 'invalid' },
        () => {}
      ),
      /with or without/u
    );
    assert.equal(opens, 1);
    await assert.rejects(
      cli['forms-review'](
        { url: env.report.url, 'answer-final-period': 'invalid' },
        () => {}
      ),
      /with or without/u
    );
    assert.equal(opens, 1);
    assert.equal((await readAnswerPolicy(env.store)).answerFinalPeriod, 'with');
  }
);

test(
  'reviewed form application retains its explicit spelling through final knowledge checks',
  { timeout: 10000 },
  async (t) => {
    const env = await prepare(t);
    const planned = await env.reader.planReview({
      id: env.session.id,
      answerFinalPeriod: 'without',
    });
    assert.equal(planned.fields[0].answer.text, 'Vietnam');
    assert.equal(planned.fields[0].answer.count, 5);
    assert.equal(planned.fields[0].answer.reuseRequiresReview, false);
    const result = await env.reader.applyReview({
      id: env.session.id,
      planId: planned.reviewPlan.id,
      fields: [planned.fields[0].id],
    });
    assert.equal(result.receipts[0].status, 'applied');
    assert.equal(env.report.fields[0].value, 'Vietnam');
    assert.equal(env.textWrites.length, 1);
    assert.equal((await readAnswerPolicy(env.store)).answerFinalPeriod, 'with');
  }
);

test(
  'form CLI initial prefill and interactive plans share the resolved configuration',
  { timeout: 10000 },
  async (t) => {
    const config = await configuration(t);
    for (const prefill of [false, true]) {
      const env = await prepare(t);
      await env.reader.stop();
      const output = [];
      const cli = createFormsCommands({
        ...env.options,
        reportWriter: null,
        openStore: async () => env.store,
        async *reviewInput() {
          if (!prefill) {
            yield 'plan form-1';
          }
          yield 'quit';
        },
      });
      assert.equal(
        await cli['forms-review'](
          {
            url: env.report.url,
            prefill,
            configuration: config.file,
            'no-learn': true,
          },
          (line) => output.push(JSON.parse(line))
        ),
        0
      );
      const result = output.find(
        (item) => item.mode === (prefill ? 'prefill-result' : 'answer-plan')
      );
      const answer = prefill
        ? result.report.fields[0].plannedAnswer
        : result.fields[0].answer;
      assert.equal(answer.text, 'Vietnam');
      assert.equal(answer.count, 5);
      assert.equal(env.textWrites.length, prefill ? 1 : 0);
    }
  }
);

test(
  'both Lino form paths retain spelling and reject a changed preference on the same prefill request',
  { timeout: 10000 },
  async (t) => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const env = await prepare(t);
      await env.reader.stop();
      const http = await formReviewHttp(env.options, media);
      try {
        const headers = { origin: http.base };
        const standalone = await readWireResponse(
          await fetch(`${http.base}/api/forms/plan`, {
            method: 'POST',
            headers: { ...headers, accept: media, 'content-type': media },
            body: encodeWire(
              { inspection: env.report, answerFinalPeriod: 'without' },
              media
            ),
          })
        );
        assert.equal(standalone.fields[0].answer.text, 'Vietnam');
        const opened = await http.post(
          'open',
          { url: env.report.url, learn: false },
          headers
        );
        const input = { id: opened.session.id, answerFinalPeriod: 'without' };
        const planned = await http.post('plan', input, headers);
        assert.equal(planned.fields[0].answer.text, 'Vietnam');
        const request = { ...input, requestId: 'form-period-request' };
        const result = await http.post('prefill', request, headers);
        assert.equal(result.receipts[0].status, 'applied');
        assert.equal(result.submissionAttempted, false);
        assert.equal(env.report.fields[0].value, 'Vietnam');
        assert.deepEqual(
          (await http.post('prefill', request, headers)).receipts,
          result.receipts
        );
        assert.equal(
          (
            await http.post(
              'prefill',
              { ...request, answerFinalPeriod: 'with' },
              headers
            )
          ).code,
          'form-prefill-conflict'
        );
        assert.equal(env.textWrites.length, 1);
      } finally {
        await http.server.close();
      }
    }
  }
);

test(
  'a recovered form prefill cannot silently accept a different explicit spelling',
  { timeout: 5000 },
  async (t) => {
    const env = await prepare(t);
    const input = { requestId: 'frozen-period', answerFinalPeriod: 'with' };
    const first = await env.prefill(input);
    assert.equal(first.receipts[0].status, 'applied');
    assert.equal(env.report.fields[0].value, 'Vietnam.');
    await assert.rejects(
      env.prefill({ ...input, answerFinalPeriod: 'without' }),
      { code: 'form-prefill-conflict' }
    );
    assert.deepEqual((await env.prefill(input)).receipts, first.receipts);
    assert.equal(env.textWrites.length, 1);
  }
);

test(
  'invalid form preferences refuse before provider reads and owner edits still refuse application',
  { timeout: 10000 },
  async (t) => {
    const env = await prepare(t);
    let reads = 0;
    env.hooks.inspect = () => {
      reads++;
    };
    await assert.rejects(
      env.reader.planReview({
        id: env.session.id,
        answerFinalPeriod: 'invalid',
      }),
      /with or without/u
    );
    await assert.rejects(
      env.prefill({ answerFinalPeriod: 'invalid' }),
      /with or without/u
    );
    assert.equal(reads, 0);
    const plan = await env.reader.planReview({
      id: env.session.id,
      answerFinalPeriod: 'without',
    });
    env.report.fields[0].value = 'Owner wording';
    const result = await env.reader.applyReview({
      id: env.session.id,
      planId: plan.reviewPlan.id,
      fields: [plan.fields[0].id],
    });
    assert.equal(result.state, 'refused');
    assert.equal(result.code, 'form-changed');
    assert.equal(env.report.fields[0].value, 'Owner wording');
    assert.equal(env.textWrites.length, 0);
  }
);
