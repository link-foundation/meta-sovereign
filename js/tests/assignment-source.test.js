import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssignmentPublisher } from '../src/assignments/service.js';
import { createAssignmentSourceReader } from '../src/assignments/source-reader.js';
import { assignmentSourceReceipt } from '../src/assignments/source.js';
import { createFormsApi } from '../src/web/forms-api.js';
import {
  assignmentPublisherFixture,
  assignmentModelResult,
} from '../../experiments/issue-56/assignment-publisher-fixture.mjs';

const sourceUrl = 'https://instructions.example.test/task';
const text =
  'Design a warehouse inventory proposal. Account for damaged packages and describe a daily reconciliation process. Limit the written proposal to three pages and retain all validation requirements.';
const source = () => ({
  requestedUrl: sourceUrl,
  url: sourceUrl,
  title: 'Linked inventory instructions',
  text,
  capturedAt: '2026-01-01T00:00:00Z',
  complete: true,
  scope: 'visible-document-text',
});

const environment = async (t, options = {}) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const reads = [];
  const publisher = createAssignmentPublisher({
    ...env,
    readSource: async (url, { signal }) => {
      assert.equal(signal.aborted, false);
      reads.push(url);
      return source();
    },
    ...options,
  });
  t.after(publisher.stop);
  return { ...env, publisher, reads };
};

test('linked instructions reach private model context and frozen source proof', async (t) => {
  const env = await environment(t);
  const { draft } = await env.publisher.draft({ ...env.input, sourceUrl });
  assert.deepEqual(env.reads, [sourceUrl]);
  assert.ok(env.state.modelCalls[0].prompt.includes(text));
  assert.equal(draft.sourceEvidence.requestedUrl, sourceUrl);
  assert.equal(draft.sourceEvidence.url, sourceUrl);
  assert.equal(draft.sourceEvidence.title, source().title);
  assert.match(draft.sourceEvidence.fingerprint, /^[a-f\d]{64}$/u);
  assert.ok(!JSON.stringify(draft).includes(text));
  assert.equal((await env.store.get(draft.id)).source.text, text);
  assert.ok(!env.state.calls.includes('create'));
});

test('six words copied from linked instructions cannot become a publishable draft', async (t) => {
  const phrase =
    'Account for damaged packages and describe a daily reconciliation process';
  const env = await environment(t, {
    modelRunner: async () => ({
      ...assignmentModelResult,
      body: `${assignmentModelResult.body} ${phrase}.`,
    }),
  });
  await assert.rejects(env.publisher.draft({ ...env.input, sourceUrl }), {
    code: 'assignment-copied',
  });
  assert.equal(
    (await env.store.query((row) => row.id.startsWith('assignment-draft:')))
      .length,
    0
  );
});

test('copy checking includes the linked document title', async (t) => {
  const title = 'Warehouse inventory audit and daily reconciliation';
  const env = await environment(t, {
    readSource: async () => ({ ...source(), title }),
    modelRunner: async () => ({ ...assignmentModelResult, title }),
  });
  await assert.rejects(env.publisher.draft({ ...env.input, sourceUrl }), {
    code: 'assignment-copied',
  });
});

test('invalid linked source URLs refuse before any model invocation', async (t) => {
  const env = await environment(t);
  for (const url of [
    'file:///tmp/owner-document',
    'javascript:alert(1)',
    '/relative',
  ]) {
    await assert.rejects(env.publisher.draft({ ...env.input, sourceUrl: url }));
  }
  assert.equal(env.state.modelCalls.length, 0);
  assert.deepEqual(env.reads, []);
});

test('restore and publication use the frozen private source without a second read', async (t) => {
  const env = await environment(t);
  const { draft } = await env.publisher.draft({ ...env.input, sourceUrl });
  const restored = await env.publisher.restore(env.input);
  assert.deepEqual(restored.draft.sourceEvidence, draft.sourceEvidence);
  assert.equal((await env.publisher.publish({ draftId: draft.id })).ok, true);
  assert.deepEqual(env.reads, [sourceUrl]);
  assert.equal(env.state.modelCalls.length, 1);
  assert.ok(!JSON.stringify(env.state.issues).includes(sourceUrl));
});

test('changed private instruction text prevents restoration and GitHub writes', async (t) => {
  const env = await environment(t);
  const { draft } = await env.publisher.draft({ ...env.input, sourceUrl });
  const record = await env.store.get(draft.id);
  record.source.text += ' A later unseen requirement.';
  await env.store.put(record);
  await assert.rejects(env.publisher.restore(env.input), {
    code: 'assignment-source-changed',
  });
  await assert.rejects(env.publisher.publish({ draftId: draft.id }), {
    code: 'assignment-source-changed',
  });
  assert.ok(!env.state.calls.includes('create'));
});

test('publication checks linked-source copying again before any GitHub mutation', async (t) => {
  const env = await environment(t);
  const { draft } = await env.publisher.draft({ ...env.input, sourceUrl });
  const record = await env.store.get(draft.id);
  record.draft.body +=
    ' Account for damaged packages and describe a daily reconciliation process.';
  await env.store.put(record);
  await assert.rejects(env.publisher.publish({ draftId: draft.id }), {
    code: 'assignment-copied',
  });
  assert.ok(!env.state.calls.includes('create'));
});

test('incomplete, blocked and malformed source receipts cannot reach a model', async (t) => {
  for (const change of [
    { complete: false },
    { blocked: true },
    { scope: 'guessed' },
    { requestedUrl: 'https://other.example.test/' },
    { capturedAt: 'invalid' },
    { text: '' },
    { text: 'x'.repeat(30001) },
  ]) {
    const env = await environment(t, {
      readSource: async () => ({ ...source(), ...change }),
    });
    await assert.rejects(env.publisher.draft({ ...env.input, sourceUrl }));
    assert.equal(env.state.modelCalls.length, 0);
    assert.equal(env.state.calls.length, 0);
  }
});

const ready = { navigated: true, verified: true, status: 'ready' };
const reader = (options = {}) => {
  const calls = [];
  const read = createAssignmentSourceReader({
    store: {},
    openSession: async (policy) => {
      calls.push(policy);
      return {
        commander: {
          goto: async () => ready,
          evaluate: async () => source(),
          ...options.commander,
        },
        close: async () => calls.push('closed'),
        ...options.session,
      };
    },
  });
  return { read, calls };
};
test('instruction reader owns a separate policy browser and permits evidenced redirects', async () => {
  const { read, calls } = reader({
    commander: {
      evaluate: async () => ({
        ...source(),
        url: 'https://resolved.example.test/task',
      }),
    },
  });
  const result = await read(sourceUrl);
  assert.equal(result.url, 'https://resolved.example.test/task');
  assert.equal(calls[0].platform, 'forms');
  assert.equal(calls[0].useCase, 'assignments');
  assert.equal(calls[0].slot, 'assignment-source');
  assert.equal(Object.hasOwn(calls[0], 'headless'), false);
  assert.equal(calls.at(-1), 'closed');
});

test('unconfirmed navigation never reads stale document text and closes ownership', async () => {
  for (const outcome of [
    undefined,
    { ...ready, verified: false },
    { ...ready, navigated: false },
    { ...ready, status: 'failed' },
  ]) {
    const { read, calls } = reader({
      commander: {
        goto: async () => outcome,
        evaluate: async () => assert.fail('must not read stale page'),
      },
    });
    await assert.rejects(read(sourceUrl), {
      code: 'assignment-source-unavailable',
    });
    assert.equal(calls.at(-1), 'closed');
  }
});

test('HTTP error responses refuse even when navigation reports ready', async () => {
  const frame = {};
  let listener;
  let removed = false;
  const { read, calls } = reader({
    session: {
      page: {
        mainFrame: () => frame,
        on: (_event, callback) => {
          listener = callback;
        },
        off: (_event, callback) => {
          removed = callback === listener;
        },
      },
    },
    commander: {
      goto: async () => {
        listener({
          frame: () => frame,
          status: () => 403,
          request: () => ({ isNavigationRequest: () => true }),
        });
        return ready;
      },
      evaluate: async () => assert.fail('must not read error page'),
    },
  });
  await assert.rejects(read(sourceUrl), {
    code: 'assignment-source-unavailable',
  });
  assert.equal(removed, true);
  assert.equal(calls.at(-1), 'closed');
});

test('browser draft receipts require matching bounded source evidence', async (t) => {
  const env = await environment(t);
  const input = { ...env.input, sourceUrl };
  const preview = await env.publisher.draft(input);
  const api = (value) =>
    createFormsApi({
      report: async () => value,
      get: async () => null,
      local: {},
    });
  assert.equal(
    (await api(preview).draftFormAssignment(input)).draft.id,
    preview.draft.id
  );
  assert.equal(
    (
      await api({ ...preview, attempted: false }).restoreFormAssignment(
        env.input
      )
    ).draft.id,
    preview.draft.id
  );
  for (const sourceEvidence of [
    undefined,
    { ...preview.draft.sourceEvidence, requestedUrl: 'https://other.test/' },
    { ...preview.draft.sourceEvidence, fingerprint: 'invalid' },
    { ...preview.draft.sourceEvidence, url: 'javascript:alert(1)' },
  ]) {
    await assert.rejects(
      api({
        ...preview,
        draft: { ...preview.draft, sourceEvidence },
      }).draftFormAssignment(input)
    );
  }
  await assert.rejects(api(preview).draftFormAssignment(env.input));
  const receipt = await assignmentSourceReceipt(source(), sourceUrl);
  assert.equal(Object.hasOwn(receipt.evidence, 'text'), false);
});
