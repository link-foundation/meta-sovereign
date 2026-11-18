import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createFormMonitor } from '../src/forms/review-monitor.js';
import { createFormSessions } from '../src/forms/review-sessions.js';
import { formReportMarkdown } from '../src/forms/report-markdown.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { formChoiceEnvironment } from './helpers/forms-choice-fixture.mjs';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const monitorPage = () => {
  const page = { mainFrame: () => page };
  page.exposeBinding = async (_name, receive) => {
    page.receive = receive;
  };
  page.addInitScript = async (script) => {
    page.script = script;
  };
  return page;
};
const snapshot = () => ({
  url: 'https://example.test/questions',
  title: 'Page 1',
  fields: [],
  documentKey: 'fixture-document-1',
  reasons: [],
  navigation: { nextPage: true, limited: false },
});
const monitor = (page, options = {}) =>
  createFormMonitor({
    page,
    id: 'fixture-id',
    slot: 'form-1',
    capture: async () => {},
    ...options,
  });

test(
  'automatic checkpoints retain owner values without expiring a live reviewed plan or learning answers',
  { timeout: 5000 },
  async () => {
    const written = [];
    const env = await formChoiceEnvironment({
      monitor: true,
      reportWriter: async (report) => {
        written.push(report);
        return { state: 'saved', path: 'fixture.md' };
      },
    });
    try {
      const plan = await env.plan();
      env.field.value = 'en';
      await env.emitCapture();
      const history = await env.reader.historyReview(plan.reviewSession.id);
      assert.deepEqual(
        history.checkpoints.map((item) => item.action),
        ['plan', 'observe']
      );
      const captured = history.checkpoints[1].report;
      assert.equal(captured.fields[0].value, 'en');
      assert.equal(captured.coverage, 'partial');
      assert.equal(captured.navigation.nextPage, true);
      assert(
        !captured.reviewPlan &&
          !captured.fields[0].answer &&
          !captured.fields[0].plannedAnswer
      );
      assert.equal(history.monitoring.captured, 1);
      assert.equal(history.monitoring.learning, false);
      assert(formReportMarkdown(history).includes('Automatic capture:'));
      // Return to the reviewed value so target validation remains applicable.
      env.field.value = 'hi';
      assert.equal(
        (await env.disclose(plan)).state,
        'opened',
        'capture never clears reviewed targets'
      );
      assert.equal(written.length, 3);
    } finally {
      await env.reader.stop();
    }
  }
);

test(
  'automatic capture is bounded, ignores hidden frames and reports invalid or oversized snapshots',
  { timeout: 5000 },
  async () => {
    const page = monitorPage();
    const reports = [];
    const traces = [];
    const capture = await monitor(page, {
      capture: async (value) => reports.push(value),
      trace: (value) => traces.push(value),
    });
    const hidden = {
      frameElement: async () => ({
        evaluate: async () => false,
        dispose: async () => {},
      }),
    };
    await page.receive({ frame: hidden }, snapshot());
    assert.equal(reports.length, 0);
    await page.receive(
      { frame: page },
      { ...snapshot(), url: 'file:///private' }
    );
    await page.receive({ frame: page }, { omission: 'capture-size-limit' });
    await page.receive(
      { frame: page },
      { padding: 'x'.repeat(2 * 1024 ** 2 + 1) }
    );
    await page.receive({ frame: page }, snapshot());
    for (let index = 0; index < 11; index++) {
      const frame = {
        frameElement: async () => ({
          evaluate: async () => true,
          dispose: async () => {},
        }),
        parentFrame: () => page,
      };
      await page.receive({ frame }, snapshot());
    }
    assert.equal(reports.length, 10);
    assert.deepEqual(capture.status(), {
      state: 'active',
      captured: 10,
      omitted: 4,
      failed: 1,
      learning: false,
    });
    assert.deepEqual(traces, [
      { event: 'monitor-capture-failed', code: 'form-url' },
    ]);
    assert(!JSON.stringify(reports).includes('documentKey'));
    assert(page.script.content.includes('MutationObserver'));
    await capture.stop();
    await page.receive({ frame: page }, snapshot());
    assert.equal(reports.length, 10);
    assert.equal(capture.status().state, 'stopped');
  }
);

test(
  'capture backpressure keeps eight pending reports and shutdown waits for accepted writes',
  { timeout: 5000 },
  async () => {
    const page = monitorPage();
    const held = deferred();
    const started = deferred();
    let count = 0;
    const capture = await monitor(page, {
      capture: async () => {
        count++;
        started.resolve();
        await held.promise;
      },
    });
    const callbacks = Array.from({ length: 9 }, () =>
      page.receive({ frame: page }, snapshot())
    );
    await started.promise;
    let closed = false;
    const stopping = capture.stop().then(() => {
      closed = true;
    });
    await tick();
    assert.equal(closed, false);
    assert.equal(capture.status().omitted, 1);
    held.resolve();
    await Promise.all([...callbacks, stopping]);
    assert.equal(count, 8);
    assert.equal(capture.status().state, 'stopped');
  }
);

test(
  'owned review close drains a pending automatic report before acknowledging browser cleanup',
  { timeout: 5000 },
  async () => {
    const held = deferred();
    const started = deferred();
    const env = await formChoiceEnvironment({
      monitor: true,
      reportWriter: async () => {
        started.resolve();
        await held.promise;
        return { state: 'saved', path: 'fixture.md' };
      },
    });
    const writing = env.emitCapture();
    await started.promise;
    const id = env.reader.listReviews().sessions[0].id;
    let closed = false;
    const closing = env.reader.closeReview(id).then(() => {
      closed = true;
    });
    await tick();
    assert.equal(closed, false);
    held.resolve();
    await Promise.all([writing, closing]);
    assert.equal(env.reader.listReviews().sessions.length, 0);
    await env.reader.stop();
  }
);

test(
  'capture opt-out and installation failures leave manual review available with accurate status',
  { timeout: 5000 },
  async () => {
    const page = monitorPage();
    assert.equal(
      (await monitor(page, { enabled: false })).status().state,
      'disabled'
    );
    assert(!page.receive);
    assert.equal((await monitor({})).status().state, 'unavailable');
    page.addInitScript = async () => {
      throw new Error('not supported');
    };
    const capture = await monitor(page);
    assert.equal(capture.status().state, 'unavailable');
    assert.equal(capture.status().failed, 1);
    assert.throws(() => createFormSessions({ autoCapture: 'false' }), {
      code: 'form-options',
    });
    const env = await formChoiceEnvironment();
    try {
      await assert.rejects(
        env.reader.openReview({
          url: env.report.url,
          browserSlot: 'invalid',
          autoCapture: 'false',
        }),
        { code: 'form-options' }
      );
    } finally {
      await env.reader.stop();
    }
  }
);

test(
  'both negotiated API encodings and the CLI accept capture opt-out and reject invalid values before launch',
  { timeout: 10000 },
  async () => {
    const env = await formChoiceEnvironment({ reportWriter: null });
    await env.reader.stop();
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const http = await formReviewHttp(env.options, media);
      try {
        const opened = await http.post('open', {
          url: env.report.url,
          autoCapture: false,
        });
        assert.equal(opened.session.monitoring.state, 'disabled');
        assert.equal(
          (await http.post('history', { id: opened.session.id })).monitoring
            .learning,
          false
        );
        await http.post('close', { id: opened.session.id });
        const refused = await http.post('open', {
          url: env.report.url,
          autoCapture: 'false',
        });
        assert.equal(refused.code, 'form-options');
        const noLearning = await http.post('open', {
          url: env.report.url,
          learn: false,
        });
        assert.equal(noLearning.session.answerLearning.state, 'disabled');
        await http.post('close', { id: noLearning.session.id });
        assert.equal(
          (await http.post('open', { url: env.report.url, learn: 'false' }))
            .code,
          'form-options'
        );
      } finally {
        await http.server.close();
      }
    }
    let stores = 0;
    const cli = createFormsCommands({
      ...env.options,
      openStore: async () => {
        stores++;
        return env.options.store;
      },
      async *reviewInput() {
        yield 'quit';
      },
    });
    await assert.rejects(
      cli['forms-review'](
        { url: env.report.url, 'capture-pages': 'invalid' },
        () => {}
      ),
      /capture-pages/
    );
    assert.equal(stores, 0);
    await assert.rejects(
      cli['forms-review'](
        { url: env.report.url, 'no-learn': 'invalid' },
        () => {}
      ),
      /no-learn/
    );
    assert.equal(stores, 0);
    const output = [];
    assert.equal(
      await cli['forms-review'](
        { url: env.report.url, 'capture-pages': 'false' },
        (line) => output.push(JSON.parse(line))
      ),
      0
    );
    assert.equal(output[0].session.monitoring.state, 'disabled');
    const disabled = [];
    assert.equal(
      await cli['forms-review'](
        { url: env.report.url, 'no-learn': true },
        (line) => disabled.push(JSON.parse(line))
      ),
      0
    );
    assert.equal(disabled[0].session.answerLearning.state, 'disabled');
  }
);
