import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveAnswerRule } from '../src/automation/question-store.js';
import { readAnswerPolicy } from '../src/automation/question-policy.js';
import { normalizeAnswerAction } from '../src/automation/question-answers.js';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';
import {
  questionBrowserCli,
  questionBrowserHttp,
} from '../../experiments/issue-56/question-browser-clients.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { unreadAnswerFixture } from '../../experiments/issue-56/unread-answer-fixture.mjs';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { normalizeAutomation } from '../src/automation/automations.js';

const periodRule = {
  id: 'worker-period',
  question: 'Where do you live?',
  answers: [
    { text: 'Vietnam', count: 4, approved: true },
    { text: 'Vietnam.', count: 1, approved: true },
  ],
};

const prepare = async (t) => {
  const env = await questionWatchFixture();
  t.after(async () => {
    await env.browser.close();
    await env.store.close?.();
  });
  env.state.snapshot.question.body = periodRule.question;
  env.state.snapshot.strictOptions = false;
  env.state.snapshot.answerOptions = [];
  await saveAnswerRule(env.store, periodRule);
  return env;
};

test(
  'CLI browser inspection resolves its selected Lino period setting without saving policy',
  { timeout: 10000 },
  async (t) => {
    const env = await prepare(t);
    const dir = await mkdtemp(join(tmpdir(), 'ms-worker-period-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const file = join(dir, 'worker.lenv');
    await writeFile(file, 'ANSWER_FINAL_PERIOD: without\n');
    const before = await readAnswerPolicy(env.store);
    const call = questionBrowserCli(env);
    const inspected = await call('inspect', {
      ...env.review.target,
      configuration: file,
    });
    assert.equal(inspected.code, 0);
    assert.equal(inspected.value.plan.text, 'Vietnam');
    assert.equal(inspected.value.plan.count, 5);
    assert.equal(
      (await env.store.get(inspected.value.id)).planning.answerFinalPeriod,
      'without'
    );
    assert.deepEqual(await readAnswerPolicy(env.store), before);
    const explicit = await call('inspect', {
      ...env.review.target,
      configuration: file,
      'answer-final-period': 'with',
    });
    assert.equal(explicit.value.plan.text, 'Vietnam.');
  }
);

test(
  'watched revalidation retains the inspected period preference through owned draft preparation',
  { timeout: 10000 },
  async (t) => {
    const env = await prepare(t);
    const review = await env.browser.inspect({
      ...env.review.target,
      answerFinalPeriod: 'without',
    });
    assert.equal(review.plan.text, 'Vietnam');
    env.input.review = review.id;
    await env.browser.watchStart(env.input);
    const result = await env.until((status) =>
      ['prefilled', 'review', 'failed'].includes(status.phase)
    );
    assert.equal(result.phase, 'prefilled');
    assert.equal(env.state.prefills[0].text, 'Vietnam');
    assert.equal(env.state.sends.length, 0);
  }
);

test(
  'both Lino inspections retain period overrides in the immutable planning record',
  { timeout: 10000 },
  async (t) => {
    const env = await prepare(t);
    const { server, call } = await questionBrowserHttp(env);
    t.after(() => server.close());
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const response = await call(
        'inspect',
        { ...env.review.target, answerFinalPeriod: 'without' },
        media
      );
      assert.equal(response.status, 200);
      assert.equal(response.body.plan.text, 'Vietnam');
      const record = await env.store.get(response.body.id);
      assert.equal(record.planning.answerFinalPeriod, 'without');
      assert.equal(
        (await readAnswerPolicy(env.store)).answerFinalPeriod,
        'with'
      );
    }
  }
);

test(
  'invalid worker period configuration refuses before provider reads and action normalization preserves valid values',
  { timeout: 10000 },
  async (t) => {
    const env = await prepare(t);
    assert.equal(
      normalizeAnswerAction({ answerFinalPeriod: 'without' }).answerFinalPeriod,
      'without'
    );
    assert.throws(
      () => normalizeAnswerAction({ answerFinalPeriod: 'invalid' }),
      /with or without/u
    );
    const before = env.state.reads.length;
    const result = await questionBrowserCli(env)('inspect', {
      ...env.review.target,
      'answer-final-period': 'invalid',
    });
    assert.equal(result.code, 1);
    assert.equal(env.state.reads.length, before);
    assert.equal((await readAnswerPolicy(env.store)).answerFinalPeriod, 'with');
  }
);

test(
  'CLI unread answer passes retain the resolved period setting for planning and draft revalidation',
  { timeout: 10000 },
  async (t) => {
    const env = await unreadAnswerFixture({
      rows: [
        {
          question: {
            id: 'period-unread',
            body: periodRule.question,
            outgoing: false,
          },
          strictOptions: false,
        },
      ],
    });
    t.after(async () => {
      await env.browser.close();
      await env.store.close?.();
    });
    await saveAnswerRule(env.store, periodRule);
    const result = await questionBrowserCli(env)('unread', {
      source: 'hh',
      'pass-id': env.input.id,
      confirm: true,
      'answer-chats': true,
      'answer-final-period': 'without',
    });
    assert.equal(result.code, 0);
    assert.equal(result.value.entries[0].answer.phase, 'prefilled');
    assert.deepEqual(env.state.prefills, [{ chat: '8', text: 'Vietnam' }]);
    const review = await env.store.get(result.value.entries[0].reviewId);
    assert.equal(review.planning.answerFinalPeriod, 'without');
    assert.equal((await readAnswerPolicy(env.store)).answerFinalPeriod, 'with');
    assert.equal(env.state.sends.length, 0);
  }
);

test(
  'saved action and file period preferences survive absent command overrides',
  { timeout: 10000 },
  async (t) => {
    const env = await prepare(t);
    const dir = await mkdtemp(join(tmpdir(), 'ms-period-input-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const action = { kind: 'answer-questions', answerFinalPeriod: 'without' };
    await env.store.put(normalizeAutomation({ id: 'period-saved', action }));
    const file = join(dir, 'answer.json');
    await writeFile(file, JSON.stringify({ action }));
    const cli = createAutomationCommands({
      openStore: async () => env.store,
      send: env.send,
    });
    for (const input of [{ automation: 'period-saved' }, { config: file }]) {
      const output = [];
      assert.equal(
        await cli.automations(
          {
            _: ['answers', 'plan'],
            question: periodRule.question,
            json: true,
            ...input,
          },
          (line) => output.push(line)
        ),
        0
      );
      assert.equal(JSON.parse(output.at(-1)).text, 'Vietnam');
    }
    assert.equal(
      (await env.store.get('automation:period-saved')).action.answerFinalPeriod,
      'without'
    );
  }
);

test(
  'ordinary automation CLI planning and confirmed sending use isolated period configuration through delivery revalidation',
  { timeout: 10000 },
  async (t) => {
    const env = await prepare(t);
    const dir = await mkdtemp(join(tmpdir(), 'ms-period-run-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const configuration = join(dir, 'worker.lenv');
    await writeFile(configuration, 'ANSWER_FINAL_PERIOD: without\n');
    const automation = normalizeAutomation({
      id: 'period-run',
      mode: 'auto',
      action: { kind: 'answer-questions' },
      conditions: { mutual: false, cooldownDays: 0 },
      pacing: { typing: false },
    });
    await env.store.put(automation);
    await env.store.put({
      id: 'msg:hh:1:period',
      source: 'hh',
      chat: '1',
      sender: 'them',
      body: periodRule.question,
      timestamp: env.state.now.toISOString(),
    });
    const sent = [];
    const cli = createAutomationCommands({
      openStore: async () => env.store,
      send: async (draft) => {
        sent.push(draft);
        return { status: 'sent' };
      },
      sleep: async () => {},
    });
    for (const command of ['plan', 'run']) {
      const output = [];
      const code = await cli.automations(
        {
          _: [command, 'period-run'],
          configuration,
          json: true,
          chat: 'hh:1',
          test: true,
          confirm: true,
          self: 'me',
          now: env.state.now.toISOString(),
        },
        (line) => output.push(line)
      );
      assert.equal(code, 0, output.join('\n'));
      const result = JSON.parse(output.at(-1));
      assert.equal(result.drafts[0].text, 'Vietnam');
      if (command === 'run') {
        assert.equal(result.results[0].status, 'sent');
      }
    }
    assert.equal(sent.length, 1);
    assert.equal(sent[0].text, 'Vietnam');
    assert.deepEqual(await env.store.get(automation.id), automation);
    assert.equal((await readAnswerPolicy(env.store)).answerFinalPeriod, 'with');
  }
);
