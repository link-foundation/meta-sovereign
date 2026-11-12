import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cvTranslationFixture } from '../../experiments/issue-56/cv-translation-fixture.mjs';
import {
  cvTranslationOptions,
  cvTranslationVerdict,
  confirmedCvTranslation,
  fingerprintCvTranslation,
} from '../src/jobs/cv-translation-record.js';
import { createCvTranslationApi } from '../src/web/cv-translation-api.js';

test('the vacancy service exposes bounded private translation comparison and provenance', async () => {
  const f = cvTranslationFixture();
  try {
    assert.equal(typeof f.service['cv-translate'], 'function');
    const answer = await f.service['cv-translate'](f.input);
    assert.equal(answer.comparison.state, 'completed');
    assert.equal(answer.comparison.providerSaved, false);
    assert.equal(answer.comparison.requiresReview, true);
    assert.equal(answer.comparison.rows[0].chosenBy, 'haiku');
    assert.equal(answer.comparison.rows[0].variants[2].reason, 'placeholder');
    assert.deepEqual(
      f.calls.translate.map((call) => call.provider),
      ['haiku', 'luna', 'formal-ai']
    );
    assert.deepEqual(
      await confirmedCvTranslation(answer, { requestId: f.input.requestId }),
      answer
    );
    assert.deepEqual(await f.service['cv-translate'](f.input), answer);
    assert.equal(f.calls.translate.length, 3);
    await assert.rejects(
      f.service['cv-translate']({ ...f.input, to: 'ru', from: 'en' }),
      { code: 'jobs-cv-translation-conflict' }
    );
  } finally {
    await f.service.stop();
  }
});

test('cache reuse is exact per source direction provider and resolved version; invalid outputs retry', async () => {
  const f = cvTranslationFixture();
  try {
    await f.service['cv-translate'](f.input);
    const next = await f.service['cv-translate']({
      ...f.input,
      requestId: randomUUID(),
    });
    assert.deepEqual(
      next.comparison.rows[0].variants.map((v) => v.cached),
      [true, true, false]
    );
    assert.equal(f.calls.translate.length, 4);
    f.modes.model = 'gpt-6.1-luna';
    await f.service['cv-translate']({ ...f.input, requestId: randomUUID() });
    assert.equal(f.calls.translate.length, 6);
    await f.service['cv-translate']({
      ...f.input,
      requestId: randomUUID(),
      from: 'en',
      to: 'ru',
      texts: ['Developed software.'],
    });
    assert.equal(f.calls.translate.length, 9);
    const rows = await f.store.query((row) =>
      row.id.startsWith('jobs-cv-translation-cache:')
    );
    assert.equal(rows.length, 5);
    assert(rows.every((row) => !row.output.includes('response:translate')));
  } finally {
    await f.service.stop();
  }
});

test('failed providers do not suppress alternatives and retry only on a new explicit request', async () => {
  const f = cvTranslationFixture();
  f.modes.fail = 'haiku';
  try {
    const answer = await f.service['cv-translate'](f.input);
    assert.equal(answer.comparison.rows[0].chosenBy, 'luna');
    assert.equal(answer.comparison.rows[0].variants[0].reason, 'unavailable');
    assert(!JSON.stringify(answer).includes('private-fixture-detail'));
    await f.service['cv-translation-status'](f.input);
    await f.service['cv-translate'](f.input);
    assert.equal(f.calls.translate.length, 3);
    f.modes.fail = '';
    const next = await f.service['cv-translate']({
      ...f.input,
      requestId: randomUUID(),
    });
    assert.equal(next.comparison.rows[0].chosenBy, 'haiku');
    assert.equal(f.calls.translate.length, 5);
  } finally {
    await f.service.stop();
  }
});

test('invalid placeholders, wrong language, gaps, unchanged sources and malformed inputs fail closed', () => {
  for (const output of [
    '',
    null,
    [],
    'response:translate',
    'Web search requested',
    'I could not translate; translation gap',
    'Программист',
    'Разработчик',
    'Only English',
  ]) {
    const to = output === 'Only English' ? 'ru' : 'en';
    assert.equal(cvTranslationVerdict('Программист', output, to).text, null);
  }
  const f = cvTranslationFixture();
  for (const more of [
    { texts: [] },
    { texts: ['x'.repeat(12001)] },
    { texts: Array(51).fill('x') },
    { texts: ['a\u0000b'] },
    { to: 'ru' },
    { from: 'zh' },
    { providers: ['haiku', 'haiku'] },
    { models: { luna: 'gpt-6-sol' } },
    { models: { haiku: 'sonnet' } },
  ]) {
    assert.throws(() => cvTranslationOptions({ ...f.input, ...more }));
  }
  assert.equal(f.calls.translate.length, 0);
});

test('complete request identity and chosen provenance are validated after transport', async () => {
  const f = cvTranslationFixture();
  try {
    const answer = await f.service['cv-translate'](f.input);
    for (const mutate of [
      (c) => {
        c.providerSaved = true;
      },
      (c) => {
        c.rows[0].source = 'changed';
      },
      (c) => {
        c.rows[0].chosenBy = 'formal-ai';
      },
      (c) => {
        c.rows[0].variants[0].text = 'Injected answer';
      },
      (c) => {
        c.rows[0].variants[0].model = null;
      },
      (c) => {
        c.rows[0].variants[0].model = 'gpt-6-luna';
      },
      (c) => {
        c.input.unexpected = 'unacknowledged';
      },
      (c) => {
        c.rows[0].variants[0].reason = 12;
      },
      (c) => {
        c.rows[0].variants[2].cached = true;
      },
    ]) {
      const { fingerprint: _old, ...content } = JSON.parse(
        JSON.stringify(answer.comparison)
      );
      mutate(content);
      await assert.rejects(
        confirmedCvTranslation({
          comparison: await fingerprintCvTranslation(content),
        })
      );
    }
    const api = createCvTranslationApi({
      report: async () => ({ comparison: null }),
    });
    await assert.rejects(api.vacancyCvTranslate(f.input));
    const other = createCvTranslationApi({ report: async () => answer });
    await assert.rejects(
      other.vacancyCvTranslate({ ...f.input, texts: ['Другой текст'] })
    );
  } finally {
    await f.service.stop();
  }
});

test('a later batch failure preserves earlier valid and cached rows for review', async () => {
  const f = cvTranslationFixture();
  const translate = f.adapters.translate;
  let batches = 0;
  f.adapters.translate = async (...args) => {
    if (++batches === 2) {
      throw new Error('private later batch failure');
    }
    return translate(...args);
  };
  const texts = Array.from(
    { length: 6 },
    (_, i) => `Разрабатывал программное обеспечение ${i}.`
  );
  try {
    const input = { ...f.input, providers: ['haiku'], texts };
    const answer = await f.service['cv-translate'](input);
    assert.equal(answer.comparison.rows.filter((row) => row.chosen).length, 5);
    assert.equal(answer.comparison.rows[5].variants[0].reason, 'unavailable');
    const next = await f.service['cv-translate']({
      ...input,
      requestId: randomUUID(),
    });
    assert.equal(next.comparison.rows.filter((row) => row.chosen).length, 6);
    assert.deepEqual(
      next.comparison.rows.map((row) => row.variants[0].cached),
      [true, true, true, true, true, false]
    );
    assert.equal(batches, 3);
  } finally {
    await f.service.stop();
  }
});

test('bad provider model identity and malformed adapter output are refused without suppressing alternatives', async () => {
  const f = cvTranslationFixture();
  const resolve = f.adapters.resolve;
  f.adapters.resolve = async (...args) =>
    args[0] === 'haiku'
      ? { model: 'gpt-6-luna', cacheable: true }
      : resolve(...args);
  const translate = f.adapters.translate;
  f.adapters.translate = async (...args) =>
    args[0] === 'formal-ai'
      ? { model: '0.355.34', outputs: [null] }
      : translate(...args);
  try {
    const answer = await f.service['cv-translate'](f.input);
    assert.equal(answer.comparison.rows[0].chosenBy, 'luna');
    assert.equal(answer.comparison.rows[0].variants[0].model, null);
    assert.equal(answer.comparison.rows[0].variants[2].reason, 'response');
  } finally {
    await f.service.stop();
  }
});

test(
  'Stop drains owned translation; recovery and repeated requests never resume interrupted work',
  { timeout: 5000 },
  async () => {
    const f = cvTranslationFixture();
    f.modes.wait = true;
    const operation = f.service['cv-translate'](f.input);
    const rejected = assert.rejects(operation);
    while (!f.calls.translate.length) {
      await new Promise((resolve) => globalThis.setImmediate(resolve));
    }
    const second = f.create();
    assert.equal(
      (await second['cv-translation-status'](f.input)).comparison.state,
      'running'
    );
    await f.service.cancel();
    await rejected;
    assert.equal(f.calls.drained, 1);
    assert.equal(
      (await second['cv-translation-status'](f.input)).comparison.state,
      'stopped'
    );
    await second['cv-translate'](f.input);
    assert.equal(f.calls.translate.length, 1);
    const row = await f.store.get(`jobs-cv-translation:${f.input.requestId}`);
    const { fingerprint: _old, ...content } = row.comparison;
    row.comparison = await fingerprintCvTranslation({
      ...content,
      state: 'running',
    });
    await f.store.put(row);
    assert.equal(
      (await second['cv-translation-status'](f.input)).comparison.state,
      'interrupted'
    );
    await second['cv-translate'](f.input);
    assert.equal(f.calls.translate.length, 1);
    await f.service.stop();
    await second.stop();
  }
);

test('durable unreceived cancellation blocks late copies and preserves admitted comparisons', async () => {
  const f = cvTranslationFixture();
  try {
    const cancelled = await f.service['cv-translation-cancel'](f.input);
    assert.equal(cancelled.cancelled.requestId, f.input.requestId);
    assert.deepEqual(await f.service['cv-translate'](f.input), cancelled);
    assert.equal(f.calls.translate.length, 0);
    const input = { ...f.input, requestId: randomUUID() };
    const answer = await f.service['cv-translate'](input);
    assert.deepEqual(await f.service['cv-translation-cancel'](input), answer);
    assert.equal(f.calls.translate.length, 3);
  } finally {
    await f.service.stop();
  }
});

test('failed initial durability and failed cancellation acknowledge no translator admission', async () => {
  const f = cvTranslationFixture();
  f.store.flush = async () => {
    throw new Error('disk failure');
  };
  try {
    await assert.rejects(f.service['cv-translate'](f.input));
    assert.equal(f.calls.translate.length, 0);
    assert.equal(
      (await f.service['cv-translation-status'](f.input)).comparison,
      null
    );
    await assert.rejects(f.service['cv-translation-cancel'](f.input));
    assert.equal(
      (await f.service['cv-translation-status'](f.input)).comparison,
      null
    );
  } finally {
    await f.service.stop();
  }
});
