import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, PassThrough } from 'node:stream';
import { assignmentPublisherFixture } from '../../experiments/issue-56/assignment-publisher-fixture.mjs';
import { createAssignmentPublisher } from '../src/assignments/service.js';
import { currentFormAssignment } from '../src/forms/assignment-store.js';
import { testAssignmentCommand } from '../src/cli/test-assignment-command.js';
import { parseArgs } from '../src/cli/lino-args.js';
import { createFormsApi } from '../src/web/forms-api.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';

const target = 'fixture-owner/reviewed-task';
const sourceText =
  'Design the stock reconciliation process. Include a three-page proposal describing stale warehouse records and recovery.';
const sourceUrl = 'https://instructions.example.test/task';
const input = { standalone: true, target, visibility: 'private', sourceText };
const restore = { standalone: true, target };
const events = (env, name) =>
  env.state.calls.filter((call) => call === name).length;

test(
  'standalone assignment retains private instructions and recovers an issued write once',
  { timeout: 10000 },
  async (t) => {
    const env = await assignmentPublisherFixture();
    t.after(env.publisher.stop);
    const writeIssue = env.github.writeIssue;
    env.github.writeIssue = async (...args) => {
      await writeIssue(...args);
      throw new Error('fixture response lost');
    };
    const { draft } = await env.publisher.draft(input);
    const expected = { draftId: draft.id };
    assert.match(draft.assignmentId, /^standalone-assignment:[a-f\d]{64}$/u);
    assert.equal(draft.formUrl, undefined);
    assert.equal(draft.sourceEvidence.scope, 'owner-provided-text');
    assert.equal(
      JSON.parse(env.state.modelCalls[0].prompt).assignment,
      sourceText
    );
    assert.ok(!JSON.stringify(draft).includes(sourceText));
    assert.equal(events(env, 'create'), 0);
    assert.equal((await env.publisher.publish(expected)).state, 'uncertain');
    await env.publisher.stop();
    const reopened = createAssignmentPublisher(env);
    t.after(reopened.stop);
    const calls = env.state.calls.length;
    assert.deepEqual(
      await reopened.restore({ ...restore, target: target.toUpperCase() }),
      {
        ok: true,
        state: 'draft',
        draft,
        attempted: true,
        sourceText,
      }
    );
    await assert.rejects(
      reopened.draft({ ...input, sourceText: 'A different task' }),
      { code: 'assignment-pending' }
    );
    assert.equal(env.state.calls.length, calls);
    const result = await reopened.publish(expected);
    assert.equal(result.state, 'verified');
    assert.equal(result.assignment, undefined);
    assert.equal(result.issue.url, `https://github.com/${target}/issues/1`);
    assert.deepEqual(await reopened.publish(expected), result);
    assert.equal(events(env, 'create'), 1);
    assert.equal(events(env, 'create-issue'), 1);
    assert.equal(env.state.modelCalls.length, 1);
    assert.equal(
      (await currentFormAssignment(env.store, env.inspection)).state,
      'needs-repository'
    );
  }
);

test('standalone assignment rejects conflicting inputs, stale reviews and changed private text', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  for (const value of [
    { ...input, sourceText: '' },
    { ...input, sourceText: 'x'.repeat(30001) },
    { ...input, sourceUrl },
    { ...env.input, sourceText },
    { ...input, inspection: env.inspection },
  ]) {
    await assert.rejects(env.publisher.draft(value), {
      code: 'assignment-input',
    });
  }
  assert.deepEqual(env.state.calls, []);
  const { draft: old } = await env.publisher.draft(input);
  const { draft: latest } = await env.publisher.draft({
    ...input,
    sourceText: `${sourceText}\nKeep a decision log.`,
  });
  const calls = env.state.calls.length;
  await assert.rejects(env.publisher.publish({ draftId: old.id }), {
    code: 'assignment-changed',
  });
  const record = await env.store.get(latest.id);
  await env.store.put({
    ...record,
    source: { ...record.source, text: sourceText },
  });
  await assert.rejects(env.publisher.restore(restore), {
    code: 'assignment-source-changed',
  });
  await assert.rejects(env.publisher.publish({ draftId: latest.id }), {
    code: 'assignment-source-changed',
  });
  assert.equal(env.state.calls.length, calls);
});

test('standalone assignment retries flushing a verified publication without provider writes', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const { draft } = await env.publisher.draft(input);
  const put = env.store.put;
  let verified = false;
  let flushed = false;
  env.store.put = async (record) => {
    await put(record);
    verified ||= record.stage === 'verified';
  };
  env.store.flush = async () => {
    if (verified && !flushed) {
      flushed = true;
      throw new Error('fixture flush unavailable');
    }
  };
  const expected = { draftId: draft.id };
  assert.equal((await env.publisher.publish(expected)).state, 'uncertain');
  const calls = env.state.calls.length;
  flushed = false;
  await assert.rejects(env.publisher.publish(expected), /flush unavailable/u);
  const result = await env.publisher.publish(expected);
  assert.equal(result.state, 'verified');
  assert.equal(env.state.calls.length, calls);
});

test('standalone assignment lets an owner review a readable URL and update the same marked issue', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  let reads = 0;
  const publisher = createAssignmentPublisher({
    ...env,
    readSource: async (url) => {
      reads++;
      return {
        requestedUrl: url,
        url,
        scope: 'visible-document-text',
        complete: true,
        title: 'Warehouse proposal',
        text: sourceText,
        capturedAt: '2026-01-01T00:00:00Z',
      };
    },
  });
  t.after(publisher.stop);
  const { draft } = await publisher.draft({
    ...input,
    sourceText: undefined,
    sourceUrl,
  });
  assert.equal(draft.sourceEvidence.url, sourceUrl);
  assert.equal((await publisher.restore(restore)).sourceText, undefined);
  assert.equal(
    (await publisher.publish({ draftId: draft.id })).state,
    'verified'
  );
  assert.equal(reads, 1);
  const revised = createAssignmentPublisher({
    ...env,
    modelRunner: async (request) => ({
      ...(await env.modelRunner(request)),
      title: 'Inventory reconciliation review',
    }),
  });
  t.after(revised.stop);
  const { draft: latest } = await revised.draft(input);
  assert.equal(latest.assignmentId, draft.assignmentId);
  const result = await revised.publish({ draftId: latest.id });
  assert.equal(result.state, 'verified');
  assert.equal(events(env, 'create-issue'), 1);
  assert.equal(events(env, 'update-issue'), 1);
  assert.equal(env.state.issues[0].title, latest.title);
});

test(
  'standalone assignment CLI uses a file or portable stdin and confirms the saved draft',
  { timeout: 15000 },
  async (t) => {
    const env = await assignmentPublisherFixture();
    t.after(env.publisher.stop);
    const directory = await mkdtemp(join(tmpdir(), 'assignment-standalone-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const filename = join(directory, 'private-task.txt');
    await writeFile(filename, sourceText);
    const command = testAssignmentCommand({
      openStore: async () => env.store,
      modelRunner: env.modelRunner,
      assignmentGithub: env.github,
      assignmentStdin: Readable.from([Buffer.from(sourceText)]),
    });
    const output = [];
    const log = (line) => output.push(JSON.parse(line));
    assert.equal(
      await command(parseArgs([target, '--from', filename, '--dry-run']), log),
      0
    );
    const first = output.at(-1).draft;
    assert.equal(
      await command(parseArgs([target, '--from', '-', '--dry-run']), log),
      0
    );
    const latest = output.at(-1).draft;
    assert.deepEqual(
      env.state.modelCalls.map(
        (request) => JSON.parse(request.prompt).assignment
      ),
      [sourceText, sourceText]
    );
    assert.equal(
      first.sourceEvidence.fingerprint,
      latest.sourceEvidence.fingerprint
    );
    assert.ok(!JSON.stringify(output).includes(filename));
    assert.equal(events(env, 'create'), 0);
    await assert.rejects(
      command({ 'draft-id': latest.id, from: filename }, log),
      /fixes its instruction source/u
    );
    assert.equal(await command({ 'draft-id': latest.id }, log), 0);
    assert.equal(output.at(-1).state, 'verified');
  }
);

test('standalone assignment command text refuses invalid UTF-8, oversize, non-files and cancelled pipes', async (t) => {
  const { readAssignmentCommandText } =
    await import('../src/cli/assignment-command-source.js');
  const directory = await mkdtemp(
    join(tmpdir(), 'assignment-standalone-input-')
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bad = join(directory, 'invalid.txt');
  await writeFile(bad, Buffer.from([0xe0, 0x2a, 0xa0]));
  const controller = new AbortController();
  await assert.rejects(
    readAssignmentCommandText(bad, null, controller.signal),
    /UTF-8/u
  );
  await assert.rejects(
    readAssignmentCommandText(directory, null, controller.signal),
    /regular UTF-8/u
  );
  await assert.rejects(
    readAssignmentCommandText(
      '-',
      Readable.from([Buffer.alloc(120001)]),
      controller.signal
    ),
    /30,000/u
  );
  const pipe = new PassThrough();
  const running = readAssignmentCommandText('-', pipe, controller.signal);
  controller.abort();
  await assert.rejects(running, { name: 'AbortError' });
  assert.ok(pipe.destroyed);
});

test(
  'standalone assignment browser adapter verifies the source and both Lino routes before publication',
  { timeout: 15000 },
  async () => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const env = await assignmentPublisherFixture();
      const { server, base } = await formReviewHttp(
        {
          store: env.store,
          assignmentGithub: env.github,
          modelRunner: env.modelRunner,
        },
        media
      );
      const report = async (path, body) =>
        readWireResponse(
          await fetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'content-type': media, accept: media },
            body: encodeWire(body, media),
          })
        );
      const api = createFormsApi({ report, get: async () => null, local: {} });
      try {
        const { draft } = await api.draftFormAssignment(input);
        const restored = await api.restoreFormAssignment(restore);
        assert.equal(restored.sourceText, sourceText);
        assert.deepEqual(restored.draft, draft);
        const forged = createFormsApi({
          report: async () => ({ ...restored, sourceText: 'Different' }),
          get: async () => null,
          local: {},
        });
        await assert.rejects(forged.restoreFormAssignment(restore), {
          code: 'assignment-unconfirmed',
        });
        assert.equal(events(env, 'create'), 0);
        const result = await api.publishFormAssignment(draft);
        assert.equal(result.state, 'verified');
        assert.equal(result.assignment, undefined);
      } finally {
        await server.close();
        await env.publisher.stop();
      }
    }
  }
);
