import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { createFormReader } from '../src/forms/reader.js';
import { createAssignmentRepositoryService } from '../src/forms/assignment-service.js';
import { createAssignmentGithubVerifier } from '../src/forms/assignment-github.js';
import { assignmentRepositoryName } from '../src/forms/assignment-repository.js';
import {
  assignmentRecordId,
  recognizeFormAssignment,
} from '../src/forms/assignment-recognition.js';
import { rememberFormAssignment } from '../src/forms/assignment-store.js';
import { automaticFormEnvironment } from './helpers/forms-auto-prefill-fixture.mjs';
import { formUploadEnvironment } from './helpers/forms-upload-fixture.mjs';
import { saveConfiguredResume } from '../src/forms/configured-resume.js';
import { learnFormAnswerPairs } from '../src/forms/answer-learning.js';
import { attachReviewedResume } from '../src/forms/review-upload.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { createFormsApi } from '../src/web/forms-api.js';
import { FormAssignmentControl } from '../src/web/form-assignment.js';
import { FormPlanSummary } from '../src/web/forms-answer.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { formReportMarkdown } from '../src/forms/report-markdown.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  assignmentTask,
  assignmentRepository,
  assignmentReceipt,
  assignmentInspection,
  seedAssignmentAnswers,
} from '../../experiments/issue-56/forms-assignment-fixture.mjs';

const setup = async () => {
  const store = createMemoryStore();
  await seedAssignmentAnswers(store);
  return { store, inspection: assignmentInspection() };
};
const link = async (store, inspection, options = {}) => {
  const assignment = await rememberFormAssignment(store, inspection);
  const service = createAssignmentRepositoryService({
    store,
    verifyRepository: async (name) => assignmentReceipt(name),
    ...options,
  });
  try {
    return await service.register({
      inspection,
      revision: assignment.revision,
      repository: assignmentRepository,
    });
  } finally {
    await service.stop();
  }
};
const options = (inspection) => ({
  inspection,
  profile: {
    full_name: 'Fixture Owner',
    github: 'https://github.com/fixture-owner',
  },
  modelDraft: true,
});

test('assignment prerequisite holds saved answers, profile contacts and model drafts for the whole form', async () => {
  const { store, inspection } = await setup();
  let calls = 0;
  const plan = await planFormAnswers(store, options(inspection), {
    runner: async () => {
      calls++;
      throw new Error('not allowed');
    },
  });
  assert.equal(plan.planning.proposed, 0);
  assert.equal(calls, 0);
  assert.equal(plan.planning.assignment.state, 'needs-repository');
  assert.ok(
    plan.fields.every((field) => field.answer.reason === 'assignment-required')
  );
  assert.match(formReportMarkdown(plan), /Assignment prerequisite/);
});

test(
  'automatic prefilling refuses all writes and PDF uploads before the assignment repository',
  { timeout: 10000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    env.report.frames[0].intro = assignmentTask;
    await saveConfiguredResume(env.options.store, { file: env.file });
    const result = await env.prefill();
    assert.equal(result.code, 'form-assignment-required');
    assert.equal(result.state, 'refused');
    assert.equal(result.complete, false);
    assert.deepEqual(result.receipts, []);
    assert.deepEqual(result.uploads, []);
    assert.deepEqual(env.textWrites, []);
    assert.equal(env.uploads, 0);
  }
);

test(
  'reviewed PDF attachment also refuses a held assignment before consuming the plan',
  { timeout: 10000 },
  async (t) => {
    const env = await formUploadEnvironment();
    t.after(() => env.reader.stop());
    env.report.frames[0].intro = assignmentTask;
    const plan = await env.plan();
    await assert.rejects(env.attach(plan), {
      code: 'form-assignment-required',
    });
    assert.equal(env.writes, 0);
    assert.equal(env.disposed, 0);
  }
);

test('positive repository receipt binds only this assignment link and preserves owner content', async () => {
  const { store, inspection } = await setup();
  inspection.fields[2].value = 'https://github.com/fixture-owner/owner-edit';
  const result = await link(store, inspection);
  assert.equal(result.assignment.state, 'verified');
  const plan = await planFormAnswers(store, options(inspection));
  const field = plan.fields[2];
  assert.equal(field.answer.source, 'assignment');
  assert.equal(field.answer.text, assignmentRepository);
  assert.equal(field.answer.preserveCurrent, true);
  assert.equal(field.value, 'https://github.com/fixture-owner/owner-edit');
  assert.equal(plan.fields[1].answer.text, 'B2');
  assert.notEqual(plan.fields[3].answer.text, assignmentRepository);
  assert.equal(field.answer.assignmentRevision, result.assignment.revision);
  assert.equal(field.answer.requiresReview, true);
});

test('private hold survives later pages, reopen and fragments while other forms remain independent', async () => {
  const { store, inspection } = await setup();
  const held = await planFormAnswers(store, options(inspection));
  const later = globalThis.structuredClone(inspection);
  later.frames[0].intro = '';
  later.fields = later.fields.slice(0, 2);
  later.url += '#page-two';
  const reader = createFormReader({ store });
  try {
    const plan = await reader.plan(options(later));
    assert.equal(plan.planning.assignment.id, held.planning.assignment.id);
    assert.equal(plan.planning.proposed, 0);
  } finally {
    await reader.stop();
  }
  later.url = 'https://example.test/other-form';
  const other = await planFormAnswers(store, options(later));
  assert.equal(other.planning.assignment, undefined);
  assert.ok(other.planning.proposed > 0);
});

test('changed task clears a prior repository and invalidates frozen assignment revisions', async () => {
  const { store, inspection } = await setup();
  const previous = await link(store, inspection);
  const changed = assignmentInspection(
    `${assignmentTask} Add a separate audit service.`
  );
  const plan = await planFormAnswers(store, options(changed));
  assert.equal(plan.planning.assignment.state, 'needs-repository');
  assert.notEqual(
    plan.planning.assignment.revision,
    previous.assignment.revision
  );
  let calls = 0;
  const service = createAssignmentRepositoryService({
    store,
    verifyRepository: async () => {
      calls++;
      return assignmentReceipt();
    },
  });
  try {
    await assert.rejects(
      service.register({
        inspection,
        revision: previous.assignment.revision,
        repository: assignmentRepository,
      }),
      { code: 'form-assignment-changed' }
    );
    assert.equal(calls, 0);
    assert.equal(
      (await store.get(plan.planning.assignment.id)).revision,
      plan.planning.assignment.revision
    );
  } finally {
    await service.stop();
  }
});

test('missing, mismatched and malformed GitHub receipts cannot release the hold', async () => {
  for (const receipt of [
    null,
    {},
    { ...assignmentReceipt(), id: 0 },
    assignmentReceipt('other-owner/other-task'),
    { ...assignmentReceipt(), html_url: 'https://example.test/not-github' },
  ]) {
    const { store, inspection } = await setup();
    await assert.rejects(
      link(store, inspection, { verifyRepository: async () => receipt })
    );
    assert.equal(
      (await planFormAnswers(store, options(inspection))).planning.assignment
        .state,
      'needs-repository'
    );
  }
  const credentialUrl = new URL(assignmentRepository);
  credentialUrl.username = 'fixture-user';
  credentialUrl.password = 'fixture-password';
  for (const url of [
    'https://github.com/owner/repo/issues/1',
    'https://github.com/owner/repo?token=private',
    'https://github.com.evil.test/owner/repo',
    credentialUrl.href,
    'http://github.com/owner/repo',
    'https://github.com/owner/-flags',
  ]) {
    assert.throws(() => assignmentRepositoryName(url), {
      code: 'form-assignment-repository',
    });
  }
});

test(
  'repository verification rechecks a concurrently changed assignment before saving',
  { timeout: 10000 },
  async () => {
    const { store, inspection } = await setup();
    let release;
    const waiting = new Promise((resolve) => {
      release = resolve;
    });
    let started;
    const entered = new Promise((resolve) => {
      started = resolve;
    });
    const service = createAssignmentRepositoryService({
      store,
      verifyRepository: async () => {
        started();
        await waiting;
        return assignmentReceipt();
      },
    });
    const assignment = await rememberFormAssignment(store, inspection);
    const pending = service.register({
      inspection,
      revision: assignment.revision,
      repository: assignmentRepository,
    });
    try {
      await entered;
      await assert.rejects(service.register({}), { code: 'form-busy' });
      const changed = await rememberFormAssignment(
        store,
        assignmentInspection(`${assignmentTask} Different output.`)
      );
      release();
      await assert.rejects(pending, { code: 'form-assignment-changed' });
      assert.equal((await store.get(changed.id)).repository, null);
    } finally {
      release();
      await service.stop();
    }
  }
);

test(
  'reader shutdown aborts and drains the actual pending verifier without saving a late receipt',
  { timeout: 10000 },
  async () => {
    const { store, inspection } = await setup();
    const assignment = await rememberFormAssignment(store, inspection);
    let started;
    const entered = new Promise((resolve) => {
      started = resolve;
    });
    let finished = false;
    const reader = createFormReader({
      store,
      verifyAssignmentRepository: async (_name, { signal }) => {
        started();
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
        finished = true;
        return assignmentReceipt();
      },
    });
    const pending = reader.registerAssignmentRepository({
      inspection,
      repository: assignmentRepository,
      revision: assignment.revision,
    });
    const refused = assert.rejects(pending);
    await entered;
    await reader.stop();
    await refused;
    assert.equal(finished, true);
    assert.equal((await store.get(assignment.id)).repository, null);
    await assert.rejects(reader.registerAssignmentRepository({}), {
      code: 'form-stopped',
    });
  }
);

test('gh adapter uses one bounded argument-vector read and keeps process errors private', async () => {
  const calls = [];
  const verify = createAssignmentGithubVerifier({
    run: async (...args) => {
      calls.push(args);
      return { stdout: JSON.stringify(assignmentReceipt()) };
    },
  });
  assert.deepEqual(
    await verify('fixture-owner/reviewed-task'),
    assignmentReceipt()
  );
  assert.deepEqual(calls[0].slice(0, 2), [
    'gh',
    ['api', '--method', 'GET', 'repos/fixture-owner/reviewed-task'],
  ]);
  assert.equal(calls[0][2].maxBuffer, 128 * 1024);
  const missing = createAssignmentGithubVerifier({
    run: async () => {
      throw Object.assign(new Error('private credentials'), { code: 'ENOENT' });
    },
  });
  await assert.rejects(
    missing('fixture-owner/reviewed-task'),
    (error) =>
      error.code === 'form-assignment-unavailable' &&
      !error.message.includes('private credentials')
  );
});

test('bounded recognition supports the four languages, skips waived tasks and refuses oversized context', async () => {
  for (const task of [
    'Test assignment: create a service.',
    'Тестовое задание: создайте сервис.',
    '测试任务：设计服务。',
    'परीक्षण कार्य: सेवा बनाएँ।',
  ]) {
    assert.ok(await recognizeFormAssignment(assignmentInspection(task)));
  }
  const waived = assignmentInspection('No test assignment required.');
  waived.fields = waived.fields.slice(0, 2);
  assert.equal(await recognizeFormAssignment(waived), null);
  const huge = assignmentInspection();
  huge.frames = Array.from({ length: 6 }, (_, index) => ({
    ...huge.frames[0],
    id: `frame-${index + 1}`,
    intro: `${assignmentTask} ${String(index).repeat(5900)}`,
  }));
  await assert.rejects(recognizeFormAssignment(huge), {
    code: 'form-assignment-limit',
  });
});

test('a malformed saved assignment never silently becomes permission to fill', async () => {
  const { store, inspection } = await setup();
  await store.put({
    id: await assignmentRecordId(inspection.url),
    repository: {},
  });
  await assert.rejects(planFormAnswers(store, options(inspection)), {
    code: 'form-assignment-invalid',
  });
  const other = await setup();
  const bound = await link(other.store, other.inspection);
  const record = await other.store.get(bound.assignment.id);
  await other.store.put({
    ...record,
    formUrl: 'https://example.test/different-form',
  });
  await assert.rejects(
    planFormAnswers(other.store, options(other.inspection)),
    { code: 'form-assignment-invalid' }
  );
});

test('real CLI plans and verifies the same assignment with an owned store lifecycle', async () => {
  const { store, inspection } = await setup();
  const directory = await mkdtemp(join(tmpdir(), 'assignment-cli-'));
  const file = join(directory, 'inspection.json');
  const output = [];
  let closed = 0;
  store.close = async () => {
    closed++;
  };
  const commands = createFormsCommands({
    openStore: async () => store,
    reportWriter: null,
    verifyAssignmentRepository: async (name) => assignmentReceipt(name),
  });
  try {
    await writeFile(file, JSON.stringify(inspection));
    await commands['forms-plan']({ file }, (line) =>
      output.push(JSON.parse(line))
    );
    assert.equal(output[0].planning.proposed, 0);
    await commands['forms-assignment-link'](
      {
        file,
        repository: assignmentRepository,
        revision: output[0].planning.assignment.revision,
      },
      (line) => output.push(JSON.parse(line))
    );
    assert.equal(output[1].assignment.state, 'verified');
    assert.equal(closed, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  'both actual Lino transports verify identity and reject an untrusted association before gh',
  { timeout: 15000 },
  async () => {
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const { store, inspection } = await setup();
      let verified = 0;
      const { server, base } = await formReviewHttp(
        {
          store,
          verifyAssignmentRepository: async (name) => {
            verified++;
            return assignmentReceipt(name);
          },
        },
        media
      );
      const post = (path, input, headers = {}) =>
        fetch(`${base}/api/forms/${path}`, {
          method: 'POST',
          headers: { 'content-type': media, accept: media, ...headers },
          body: encodeWire(input, media),
        });
      try {
        const plan = await readWireResponse(
          await post('plan', options(inspection))
        );
        const input = {
          inspection,
          repository: assignmentRepository,
          revision: plan.planning.assignment.revision,
        };
        assert.equal(
          (
            await post('assignment/repository', input, {
              origin: 'https://untrusted.test',
            })
          ).status,
          403
        );
        assert.equal(verified, 0);
        const result = await readWireResponse(
          await post('assignment/repository', input)
        );
        assert.equal(result.assignment.state, 'verified');
        assert.equal(verified, 1);
        const ready = await readWireResponse(
          await post('plan', options(inspection))
        );
        assert.equal(ready.fields[2].answer.text, assignmentRepository);
      } finally {
        await server.close();
      }
    }
  }
);

test('web API rejects missing/mismatched confirmations and does not fall back to a local fake verification', async () => {
  const { store, inspection } = await setup();
  const assignment = await rememberFormAssignment(store, inspection);
  const good = await link(store, inspection);
  const input = {
    inspection,
    repository: assignmentRepository,
    revision: assignment.revision,
  };
  let local = 0;
  for (const result of [
    null,
    {},
    { ok: true },
    { ...good, assignment: { ...good.assignment, revision: input.revision } },
    {
      ...good,
      assignment: {
        ...good.assignment,
        repository: {
          ...good.assignment.repository,
          url: 'https://github.com/other/repo',
        },
      },
    },
  ]) {
    const api = createFormsApi({
      report: async () => result,
      local: async () => {
        local++;
        return store;
      },
    });
    await assert.rejects(api.registerFormAssignment(input));
  }
  assert.equal(local, 0);
  assert.deepEqual(
    await createFormsApi({ report: async () => good }).registerFormAssignment(
      input
    ),
    good
  );
});

test('four-language shared controls and summaries expose actual hold and repository provenance', async () => {
  const { store, inspection } = await setup();
  const plan = await planFormAnswers(store, options(inspection));
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const markup = renderToStaticMarkup(
      React.createElement(
        LocaleContext.Provider,
        { value: { locale, t: (key, vars) => translate(locale, key, vars) } },
        [
          React.createElement(FormAssignmentControl, {
            key: 'control',
            api: {},
            inspection,
            assignment: plan.planning.assignment,
          }),
          React.createElement(FormPlanSummary, {
            key: 'summary',
            planning: plan.planning,
          }),
        ]
      )
    );
    assert.ok(
      markup.includes(translate(locale, 'forms.assignment.needs-repository'))
    );
    assert.ok(markup.includes('data-form-assignment-state="needs-repository"'));
    assert.ok(!markup.includes('forms.assignment.hint'));
  }
});

test('frozen review and attachment guards cannot restore an older task association', async () => {
  const { store, inspection } = await setup();
  await link(store, inspection);
  const proposed = await planFormAnswers(store, options(inspection));
  const changed = await rememberFormAssignment(
    store,
    assignmentInspection(`${assignmentTask} New output required.`)
  );
  const frozen = await planFormAnswers(store, options(inspection), {
    frozen: proposed,
  });
  assert.equal(frozen.planning.assignment.revision, changed.revision);
  assert.equal(frozen.planning.proposed, 0);
  await assert.rejects(
    attachReviewedResume({
      store,
      record: { reviewPlan: { inspection, proposed } },
      input: {},
    }),
    { code: 'form-assignment-required' }
  );
  assert.equal((await store.get(changed.id)).revision, changed.revision);
});

test('assignment links remain form-specific rather than becoming reusable learned answers', async () => {
  const store = createMemoryStore();
  const result = await learnFormAnswerPairs(store, [
    {
      question: 'Link to the take-home exercise',
      text: assignmentRepository,
      url: 'https://example.test/form',
      evidence: 'fixture',
    },
  ]);
  assert.equal(result.saved, 0);
  assert.equal(result.skipped, 1);
});

test(
  'reverification invalidates ordinary reviewed fields even when the page has no result-link field',
  { timeout: 10000 },
  async (t) => {
    const env = await automaticFormEnvironment();
    t.after(() => env.reader.stop());
    env.report.frames[0].intro = assignmentTask;
    await link(env.options.store, env.report);
    const input = { id: env.session.id, profileId: env.profile.id };
    const plan = await env.reader.planReview(input);
    const fresh = await link(env.options.store, env.report);
    const result = await env.reader.applyReview({
      id: env.session.id,
      planId: plan.reviewPlan.id,
      fields: [env.report.fields[0].id],
    });
    assert.equal(result.state, 'refused');
    assert.equal(result.code, 'form-answers-changed');
    assert.deepEqual(env.textWrites, []);
    assert.equal(
      (await env.options.store.get(fresh.assignment.id)).revision,
      fresh.assignment.revision
    );
  }
);
