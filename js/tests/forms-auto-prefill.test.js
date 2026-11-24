import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticFormEnvironment } from './helpers/forms-auto-prefill-fixture.mjs';
import { saveConfiguredResume } from '../src/forms/configured-resume.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { automaticReviewFields } from '../src/forms/automatic-prefill.js';
import { createFormsApi } from '../src/web/forms-api.js';
import { formReportMarkdown } from '../src/forms/report-markdown.js';
import {
  seedModelAnswers,
  modelRunnerFixture,
  modelQuestion,
  modelText,
} from '../../experiments/issue-56/forms-model-fixture.mjs';

test(
  'automatic prefill fills more than a manual selection and verifies the configured PDF',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment(27);
    t.after(() => env.reader.stop());
    await saveConfiguredResume(env.options.store, { file: env.file });
    const result = await env.prefill();
    assert.equal(result.state, 'prefilled');
    assert.equal(result.complete, true);
    assert.equal(result.requiresReview, true);
    assert.equal(result.submissionAttempted, false);
    assert.equal(result.receipts.length, 27);
    assert(result.receipts.every((receipt) => receipt.status === 'applied'));
    assert.equal(env.textWrites.length, 27);
    assert.equal(result.uploads[0].state, 'attached');
    assert.equal(result.uploads[0].report, undefined);
    assert.equal(env.uploads, 1);
    assert.equal(result.report.fields[0].value, 'Ada Example');
    assert.equal(result.report.fields[0].plannedAnswer.source, 'profile');
    assert(!JSON.stringify(result).includes(env.file.data));
    const history = await env.reader.historyReview(env.session.id);
    assert(history.checkpoints.some((entry) => entry.action === 'prefill'));
    const markdown = formReportMarkdown(history);
    assert.match(markdown, /submissionAttempted/iu);
    assert.match(markdown, /Proposed answer source: profile/u);
    assert.match(markdown, /Submit the form yourself/u);
  }
);

test(
  'automatic model prefilling requests once, applies grounded text and leaves clarification open',
  { timeout: 5000 },
  async (t) => {
    const calls = [];
    const env = await automaticFormEnvironment(2, {
      modelRunner: modelRunnerFixture(calls),
    });
    t.after(() => env.reader.stop());
    await seedModelAnswers(env.options.store);
    env.report.fields[0].label = modelQuestion;
    env.report.fields[1].label = 'Starting date for this vacancy?';
    const result = await env.prefill({
      modelDraft: true,
      approximate: false,
      file: env.file,
    });
    assert.equal(result.state, 'partial');
    assert.equal(calls.length, 1);
    assert.equal(env.report.fields[0].value, modelText);
    assert.equal(env.report.fields[1].value, '');
    assert.equal(result.receipts.length, 1);
    assert.equal(result.uploads[0].state, 'attached');
    assert.equal(result.report.fields[0].plannedAnswer.source, 'model');
    assert(result.unresolved.some((item) => item.label.includes('Starting')));
  }
);

test('browser prefill preserves server refusals and never falls back to offline writes', async () => {
  const calls = [];
  let response = { ok: false, code: 'form-busy' };
  const api = createFormsApi({
    report: async (...args) => {
      calls.push(args);
      return response;
    },
    local: new Proxy(
      {},
      {
        get: () => assert.fail('prefill must use the owned server session'),
      }
    ),
  });
  const input = { id: 'review-one', requestId: 'first' };
  assert.deepEqual(await api.formsPrefillReview(input), response);
  assert.deepEqual(calls[0], [
    '/api/forms/sessions/prefill',
    input,
    { network: true },
  ]);
  response = null;
  assert.deepEqual(await api.formsPrefillReview(input), {
    ok: false,
    code: 'server-required',
  });
  assert.equal(calls.length, 2);
});

test(
  'automatic prefill preserves owner content, unknown fields and existing files and reports the next page',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    env.report.fields[0].value = 'Owner keeps this';
    env.report.fields[1].label = 'Something only the owner knows';
    env.field.upload.files = [
      { name: 'owner.pdf', size: 1, type: 'application/pdf', lastModified: 0 },
    ];
    env.report.navigation = { nextPage: true, limited: false };
    const result = await env.prefill({ file: env.file });
    assert.equal(result.state, 'partial');
    assert.equal(result.complete, false);
    assert.equal(result.nextPage, true);
    assert.match(result.note, /next page/iu);
    assert.equal(env.report.fields[0].value, 'Owner keeps this');
    assert.equal(env.report.fields[1].value, '');
    assert.equal(env.uploads, 0);
    assert.deepEqual(env.textWrites, []);
    assert(
      result.unresolved.some((item) => item.fieldId === env.report.fields[1].id)
    );
  }
);

test(
  'an uncertain write stops automatic prefilling and a recovered request never repeats it',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    env.hooks.textWrite = async () => {
      throw new Error('lost control response');
    };
    const requestId = 'uncertain-write';
    const first = await env.prefill({ requestId, file: env.file });
    assert.equal(first.state, 'uncertain');
    assert.equal(first.receipts[0].status, 'uncertain');
    assert.equal(first.receipts[1].status, 'not-attempted');
    assert.equal(env.uploads, 0);
    const second = await env.prefill({ requestId, file: env.file });
    assert.deepEqual(second.receipts, first.receipts);
    assert.equal(second.requestId, first.requestId);
    assert.equal(env.textWrites.length, 1);
    await assert.rejects(
      env.prefill({ requestId, approximate: false, file: env.file }),
      { code: 'form-prefill-conflict' }
    );
  }
);

test(
  'owner edits while planning and changed documents stop automatic writes',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    let checks = 0;
    env.hooks.check = () => {
      if (++checks === 2) {
        env.report.fields[0].value = 'Owner edit';
      }
    };
    const result = await env.prefill({ file: env.file });
    assert.equal(result.state, 'refused');
    assert.equal(result.code, 'form-changed');
    assert.deepEqual(env.textWrites, []);
    assert.equal(env.uploads, 0);
  }
);

test(
  'the multi-URL CLI explicitly prefills each opened form before accepting review commands',
  { timeout: 5000 },
  async () => {
    const env = await automaticFormEnvironment(1);
    await env.reader.stop();
    const output = [];
    const commands = createFormsCommands({
      ...env.options,
      openStore: async () => env.options.store,
      async *reviewInput() {
        yield 'quit';
      },
    });
    const status = await commands['forms-review'](
      {
        _: [env.report.url, env.report.url],
        prefill: true,
        'profile-id': env.profile.id,
        'no-learn': true,
      },
      (line) => output.push(JSON.parse(line))
    );
    assert.equal(status, 0);
    const results = output.filter((item) => item.mode === 'prefill-result');
    assert.equal(results.length, 2);
    assert(
      results.every((item) => item.requiresReview && !item.submissionAttempted)
    );
    assert.deepEqual(
      results.map((item) => item.reviewSession.browserSlot),
      ['form-1', 'form-2']
    );
    assert.equal(env.report.fields[0].value, 'Ada Example');
  }
);

for (const media of [LINO_TEXT, LINO_BINARY]) {
  test(
    `automatic prefilling uses trusted ${media} session mutations and recovers their receipts`,
    { timeout: 5000 },
    async (t) => {
      const env = await automaticFormEnvironment();
      await env.reader.stop();
      const http = await formReviewHttp(env.options, media);
      t.after(() => http.server.close());
      const headers = { origin: http.base };
      const opened = await http.post('open', { url: env.report.url }, headers);
      const input = {
        id: opened.session.id,
        requestId: 'wire-prefill',
        profileId: env.profile.id,
        file: env.file,
      };
      const result = await http.post('prefill', input, headers);
      assert.equal(result.state, 'prefilled');
      assert.equal(result.uploads[0].state, 'attached');
      assert.equal(
        (await http.post('prefill', input, headers)).requestId,
        input.requestId
      );
      assert.equal(env.textWrites.length, 2);
      assert.equal(env.uploads, 1);
      const forbidden = await http.post('prefill', input, {
        origin: 'https://untrusted.test',
      });
      assert.equal(forbidden.code, 'forbidden');
    }
  );
}

test('automatic selection keeps incomplete drafts, radio clearing and populated fields out', () => {
  const answer = { complete: true, proposal: { value: 'known' } };
  const field = { id: 'empty', tag: 'input', type: 'text', value: '', answer };
  const fields = [
    field,
    { ...field, id: 'owner', answer: { ...answer, preserveCurrent: true } },
    { ...field, id: 'clarify', answer: { ...answer, missing: ['owner fact'] } },
    { ...field, id: 'partial', answer: { ...answer, complete: false } },
    {
      ...field,
      id: 'radio',
      type: 'radio',
      answer: {
        ...answer,
        proposal: { checked: true },
        radioPeers: ['radio', 'selected'],
        effects: [{ fieldId: 'selected', checked: false }],
      },
    },
  ];
  assert.deepEqual(
    automaticReviewFields({ fields }).map((item) => item.id),
    ['empty']
  );
});

test(
  'owner edits between text application and PDF replanning prevent attachment',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    let sawReadback = false;
    env.hooks.inspect = () => {
      if (env.textWrites.length === 2) {
        if (sawReadback) {
          env.report.fields[0].value = 'Owner changed after the text writes';
        }
        sawReadback = true;
      }
    };
    const result = await env.prefill({ file: env.file });
    assert.equal(result.state, 'partial');
    assert.equal(result.code, 'form-changed');
    assert.equal(env.uploads, 0);
    assert.equal(
      result.report.fields[0].value,
      'Owner changed after the text writes'
    );
  }
);

test(
  'prefill holds session ownership, validates requests and refuses old receipt replay',
  { timeout: 5000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    await assert.rejects(env.prefill({ requestId: '' }), {
      code: 'form-prefill-request',
    });
    await assert.rejects(
      env.prefill({ file: { name: 'bad.pdf', data: 'bad' } }),
      { code: 'form-upload-file' }
    );
    let release;
    let started;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    const held = new Promise((resolve) => {
      release = resolve;
    });
    env.hooks.textWrite = async () => {
      started();
      await held;
    };
    const pending = env.prefill({ requestId: 'first' });
    try {
      await ready;
      await assert.rejects(env.reader.readReview(env.session.id), {
        code: 'form-busy',
      });
    } finally {
      release();
    }
    await pending;
    await env.prefill({ requestId: 'second' });
    await assert.rejects(env.prefill({ requestId: 'first' }), {
      code: 'form-prefill-expired',
    });
    assert.equal(env.textWrites.length, 2);
  }
);
