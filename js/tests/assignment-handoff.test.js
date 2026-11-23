import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assignmentPublisherFixture } from '../../experiments/issue-56/assignment-publisher-fixture.mjs';
import { assignmentInspection } from '../../experiments/issue-56/forms-assignment-fixture.mjs';
import { assignmentPublicationId } from '../src/assignments/records.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { planFormAnswers } from '../src/forms/answer-plan.js';
import { createAssignmentRepositoryService } from '../src/forms/assignment-service.js';
import { LINO_BINARY, LINO_TEXT } from '../src/transport/lino.js';
import { FormAssignmentStatus } from '../src/web/form-assignment.js';
import { LocaleContext, translate } from '../src/web/i18n.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import { createWirePost } from './helpers/http-wire.mjs';

const publishedForm = async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const { draft } = await env.publisher.draft(env.input);
  const publication = await env.publisher.publish({ draftId: draft.id });
  assert.equal(publication.state, 'verified');
  return { ...env, draft, publication };
};

const formPlan = ({ store, inspection }) =>
  planFormAnswers(store, { inspection });

test('a saved publication supplies its issue in reopened form plans without reading GitHub', async (t) => {
  const env = await publishedForm(t);
  const { issue, repository } = env.publication;
  const calls = [...env.state.calls];
  const report = await formPlan(env);
  assert.deepEqual(report.planning.assignment.issue, issue);
  assert.deepEqual(report.planning.assignment.repository, repository);
  assert.equal(
    report.fields.find((field) => field.name === 'task').answer.text,
    repository.url
  );
  assert.deepEqual(env.state.calls, calls);
  assert.equal(env.state.modelCalls.length, 1);
});

test(
  'the reopened CLI and text and binary Lino plans expose the same confirmed issue',
  { timeout: 15000 },
  async (t) => {
    const env = await publishedForm(t);
    const dir = await mkdtemp(join(tmpdir(), 'assignment-handoff-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const file = join(dir, 'inspection.json');
    await writeFile(file, JSON.stringify(env.inspection));
    const commands = createFormsCommands({
      openStore: async () => env.store,
      modelRunner: env.modelRunner,
      reportWriter: null,
    });
    await t.test('CLI', async () => {
      const reports = [];
      assert.equal(
        await commands['forms-plan']({ file }, (line) =>
          reports.push(JSON.parse(line))
        ),
        0
      );
      assert.deepEqual(
        reports[0].planning.assignment.issue,
        env.publication.issue
      );
    });
    const { server, base } = await formReviewHttp(
      { store: env.store },
      LINO_TEXT
    );
    t.after(server.close);
    for (const media of [LINO_TEXT, LINO_BINARY]) {
      const post = createWirePost(base, '/api/forms', media);
      await t.test(media, async () => {
        const response = await post('/plan', { inspection: env.inspection });
        assert.equal(response.status, 200);
        assert.deepEqual(
          response.answer.planning.assignment.issue,
          env.publication.issue
        );
      });
    }
  }
);

test('an incomplete, mismatched or malformed receipt cannot supply a form issue link', async (t) => {
  const env = await publishedForm(t);
  const id = await assignmentPublicationId(
    env.draft.assignmentId,
    env.draft.target
  );
  const record = await env.store.get(id);
  for (const change of [
    { stage: 'issueIssued' },
    { draftId: 'another-draft' },
    {
      result: {
        ...record.result,
        issue: { number: 1, url: 'https://other.test/issue' },
      },
    },
    {
      result: {
        ...record.result,
        repository: { ...record.result.repository, id: 888 },
      },
    },
  ]) {
    await env.store.put({ ...record, ...change });
    const report = await formPlan(env);
    assert.equal(report.planning.assignment.issue, undefined);
    assert.deepEqual(
      report.planning.assignment.repository,
      env.publication.repository
    );
  }
  await env.store.put(record);
  const repository = createAssignmentRepositoryService({
    store: env.store,
    verifyRepository: async () => env.state.repository,
  });
  t.after(repository.stop);
  const linked = await repository.register({
    inspection: env.inspection,
    repository: env.publication.repository.url,
    revision: env.publication.assignment.revision,
  });
  assert.equal(linked.assignment.state, 'verified');
  assert.equal((await formPlan(env)).planning.assignment.issue, undefined);
});

test('new instructions at the same URL hold the form and hide the previous issue', async (t) => {
  const env = await publishedForm(t);
  const updatedTask = await formPlan({
    store: env.store,
    inspection: assignmentInspection(
      'Test assignment: describe a billing workflow using audit records and explain the verification plan.'
    ),
  });
  assert.equal(updatedTask.planning.assignment.state, 'needs-repository');
  assert.equal(updatedTask.planning.assignment.issue, undefined);
  assert.equal(updatedTask.planning.proposed, 0);
});

test('the shared assignment status links to the saved issue in every locale', async (t) => {
  const { publication } = await publishedForm(t);
  const assignment = { ...publication.assignment, issue: publication.issue };
  for (const locale of ['en', 'hi', 'ru', 'zh']) {
    const label = translate(locale, 'forms.assignment.issue', { number: 1 });
    const markup = renderToStaticMarkup(
      React.createElement(
        LocaleContext.Provider,
        { value: { locale, t: (key, vars) => translate(locale, key, vars) } },
        React.createElement(FormAssignmentStatus, { assignment })
      )
    );
    assert.ok(markup.includes(`href="${publication.issue.url}"`));
    assert.ok(markup.includes(label));
    assert.notEqual(label, 'forms.assignment.issue');
  }
});
