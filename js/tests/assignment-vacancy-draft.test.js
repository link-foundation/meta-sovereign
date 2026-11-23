import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  assignmentModelResult,
  assignmentPublisherFixture,
} from '../../experiments/issue-56/assignment-publisher-fixture.mjs';
import {
  vacancyId as id,
  vacancyUrl as url,
  vacancyPhrase as phrase,
  vacancySnapshot as snapshot,
} from '../../experiments/issue-56/assignment-vacancy-fixture.mjs';
import { createAssignmentPublisher } from '../src/assignments/service.js';
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

const sourceText = 'Prepare a compact reconciliation tool for a warehouse.';
const standalone = (target) => ({
  standalone: true,
  target,
  visibility: 'private',
  sourceText,
});
const vacancyInput = (env, value) => ({
  ...env.input,
  vacancy: undefined,
  vacancyUrl: value,
});

test('assignment vacancy draft binds an exact bare ID to the canonical cached URL', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const reads = [];
  const publisher = createAssignmentPublisher({
    ...env,
    readVacancy: async (requested) => {
      reads.push(requested);
      return snapshot;
    },
  });
  t.after(publisher.stop);
  const selected = await publisher.draft(vacancyInput(env, id));
  assert.equal(selected.draft.vacancyEvidence.url, url);
  assert.equal(selected.draft.vacancyEvidence.source, 'url');
  const restored = await publisher.restore(env.input);
  assert.deepEqual(restored.draft, selected.draft);
  const canonical = await publisher.draft(vacancyInput(env, url));
  assert.equal(
    canonical.draft.vacancyFingerprint,
    selected.draft.vacancyFingerprint
  );
  assert.deepEqual(reads, [url]);
  const record = await env.store.get(canonical.draft.id);
  await env.store.put({
    ...record,
    draft: {
      ...record.draft,
      vacancyEvidence: {
        ...record.draft.vacancyEvidence,
        url: 'https://hh.ru/vacancy/123',
      },
    },
  });
  await assert.rejects(publisher.publish({ draftId: canonical.draft.id }), {
    code: 'assignment-vacancy-changed',
  });
  await env.store.put(record);
  assert.equal(
    (await publisher.publish({ draftId: canonical.draft.id })).state,
    'verified'
  );
  assert.deepEqual(reads, [url]);
});

test('assignment vacancy draft rejects copying vacancy prose in form and standalone previews', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const publisher = createAssignmentPublisher({
    ...env,
    modelRunner: async () => ({
      ...assignmentModelResult,
      body: `${assignmentModelResult.body} Explain how to ${phrase}.`,
    }),
  });
  t.after(publisher.stop);
  for (const input of [env.input, standalone(env.input.target)]) {
    await assert.rejects(publisher.draft({ ...input, vacancy: snapshot }), {
      code: 'assignment-copied',
    });
  }
  assert.equal(env.state.calls.includes('create'), false);
});

test('assignment vacancy draft rechecks copied prose and refuses tampering before provider writes', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const { draft } = await env.publisher.draft({
    ...env.input,
    vacancy: snapshot,
  });
  const record = await env.store.get(draft.id);
  const calls = env.state.calls.length;
  const publish = () => env.publisher.publish({ draftId: draft.id });
  await env.store.put({
    ...record,
    draft: { ...draft, body: `${draft.body}\nExplain how to ${phrase}.` },
  });
  await assert.rejects(publish(), { code: 'assignment-copied' });
  await env.store.put({
    ...record,
    draft: {
      ...draft,
      vacancyEvidence: {
        ...draft.vacancyEvidence,
        vacancy: {
          ...draft.vacancyEvidence.vacancy,
          description: 'Edited after review.',
        },
      },
    },
  });
  await assert.rejects(publish(), { code: 'assignment-vacancy-changed' });
  await assert.rejects(env.publisher.restore(env.input), {
    code: 'assignment-vacancy-changed',
  });
  assert.equal(env.state.calls.length, calls);
  const legacy = globalThis.structuredClone(record);
  delete legacy.draft.vacancyReceiptFingerprint;
  await env.store.put(legacy);
  assert.equal((await publish()).state, 'verified');
});

test('assignment vacancy draft accepts a bare ID through CLI and freezes the saved context', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const reads = [];
  const command = testAssignmentCommand({
    openStore: async () => env.store,
    assignmentStdin: Readable.from([Buffer.from(sourceText)]),
    assignmentGithub: env.github,
    modelRunner: env.modelRunner,
    readAssignmentVacancy: async (requested) => {
      reads.push(requested);
      return snapshot;
    },
  });
  const output = [];
  const log = (line) => output.push(JSON.parse(line));
  const args = parseArgs([
    env.input.target,
    '--from=-',
    '--vacancy',
    id,
    '--dry-run',
  ]);
  assert.equal(await command(args, log), 0);
  const { draft } = output.at(-1);
  assert.equal(draft.vacancyEvidence.url, url);
  await assert.rejects(
    command({ 'draft-id': draft.id, vacancy: '100' }, log),
    /fixes its vacancy/u
  );
  assert.equal(await command({ 'draft-id': draft.id }, log), 0);
  assert.equal(output.at(-1).state, 'verified');
  assert.deepEqual(reads, [url]);
});

test('assignment vacancy draft rejects invalid explicit references before external context reads', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  for (const invalid of [
    null,
    '',
    '+123',
    '12 3',
    '123456789012345678901',
    123,
    'https://hh.ru.evil.test/vacancy/123',
  ]) {
    await assert.rejects(env.publisher.draft(vacancyInput(env, invalid)), {
      code: 'assignment-vacancy-url',
    });
  }
  assert.deepEqual(env.state.calls, []);
  assert.deepEqual(env.state.modelCalls, []);
});

test(
  'assignment vacancy draft preserves the requested canonical identity through both Lino formats and browser validation',
  { timeout: 15000 },
  async (t) => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const env = await assignmentPublisherFixture();
      t.after(env.publisher.stop);
      const { server, base } = await formReviewHttp(
        {
          store: env.store,
          assignmentGithub: env.github,
          modelRunner: env.modelRunner,
          readAssignmentVacancy: async () => snapshot,
        },
        media
      );
      const report = async (path, input) =>
        readWireResponse(
          await fetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'content-type': media, accept: media },
            body: encodeWire(input, media),
          })
        );
      try {
        const api = createFormsApi({
          report,
          get: async () => null,
          local: {},
        });
        const input = vacancyInput(env, id);
        const preview = await api.draftFormAssignment(input);
        assert.equal(preview.draft.vacancyEvidence.url, url);
        const evidence = preview.draft.vacancyEvidence;
        const wrong = {
          ...preview,
          draft: {
            ...preview.draft,
            vacancyEvidence: { ...evidence, url: 'https://hh.ru/vacancy/123' },
          },
        };
        const forgedApi = createFormsApi({
          report: async () => wrong,
          get: async () => null,
          local: {},
        });
        await assert.rejects(forgedApi.draftFormAssignment(input), {
          code: 'assignment-unconfirmed',
        });
        assert.equal(
          (await api.publishFormAssignment(preview.draft)).state,
          'verified'
        );
      } finally {
        await server.close();
      }
    }
  }
);
