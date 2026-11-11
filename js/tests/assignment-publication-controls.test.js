import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assignmentPublisherFixture } from '../../experiments/issue-56/assignment-publisher-fixture.mjs';
import { testAssignmentCommand } from '../src/cli/test-assignment-command.js';
import { formReviewHttp } from './helpers/forms-review-http.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { createFormsApi } from '../src/web/forms-api.js';
import { FormAssignmentControl } from '../src/web/form-assignment.js';
import { LocaleContext, translate } from '../src/web/i18n.js';

test(
  'CLI drafts without mutations and recovers a saved publication without rerunning the model',
  { timeout: 15000 },
  async (t) => {
    const env = await assignmentPublisherFixture();
    t.after(env.publisher.stop);
    const directory = await mkdtemp(join(tmpdir(), 'assignment-publication-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, 'inspection.json');
    await writeFile(file, JSON.stringify(env.inspection));
    let closed = 0;
    env.store.close = async () => {
      closed++;
    };
    const command = testAssignmentCommand({
      openStore: async () => env.store,
      modelRunner: env.modelRunner,
      assignmentGithub: env.github,
    });
    const output = [];
    const log = (line) => output.push(JSON.parse(line));
    assert.equal(
      await command({ _: [env.input.target], file, 'dry-run': true }, log),
      0
    );
    const draft = output.at(-1).draft;
    assert.equal(env.state.calls.includes('create'), false);
    assert.equal(await command({ 'draft-id': draft.id }, log), 0);
    assert.equal(output.at(-1).state, 'verified');
    const calls = env.state.calls.length;
    assert.equal(await command({ 'draft-id': draft.id }, log), 0);
    assert.equal(env.state.calls.length, calls);
    assert.equal(env.state.modelCalls.length, 1);
    assert.equal(closed, 3);
  }
);

test('invalid CLI names and contradictory dry-run recovery refuse before opening a store', async () => {
  const command = testAssignmentCommand({
    openStore: async () => assert.fail('must not open'),
  });
  for (const args of [
    { _: [] },
    { _: ['../invalid'] },
    { _: ['owner/repo/extra'] },
    { 'draft-id': 'saved', 'dry-run': true },
  ]) {
    await assert.rejects(command(args, () => {}));
  }
});

test(
  'text and binary Lino publish through the same trusted routes and current form hold',
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
        },
        media
      );
      const post = (action, input, headers = {}) =>
        fetch(`${base}/api/forms/assignment/${action}`, {
          method: 'POST',
          headers: { 'content-type': media, accept: media, ...headers },
          body: encodeWire(input, media),
        });
      try {
        assert.equal(
          (await post('draft', env.input, { origin: 'https://untrusted.test' }))
            .status,
          403
        );
        assert.equal(env.state.calls.length, 0);
        const preview = await readWireResponse(await post('draft', env.input));
        assert.equal(preview.ok, true);
        assert.equal(env.state.calls.includes('create'), false);
        const published = await readWireResponse(
          await post('publish', { draftId: preview.draft.id })
        );
        assert.equal(published.state, 'verified');
        assert.equal(published.assignment.state, 'verified');
        assert.equal(
          published.issue.url,
          `https://github.com/${env.input.target}/issues/1`
        );
        assert.equal(
          (await fetch(`${base}/api/forms/assignment/publish`)).status,
          405
        );
      } finally {
        await server.close();
      }
    }
  }
);

const browserApi = (report) =>
  createFormsApi({ report, get: async () => null, local: {} });
test('browser publication refuses offline, stale and malformed positive receipts', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const preview = await env.publisher.draft(env.input);
  const published = await env.publisher.publish({ draftId: preview.draft.id });
  const report = async (path, input, options) => {
    assert.equal(options.network, true);
    return path.endsWith('/draft') ? preview : published;
  };
  const api = browserApi(report);
  assert.equal(
    (await api.draftFormAssignment(env.input)).draft.id,
    preview.draft.id
  );
  assert.equal((await api.publishFormAssignment(preview.draft)).ok, true);
  for (const value of [
    null,
    {
      ...published,
      assignment: { ...published.assignment, revision: undefined },
    },
    { ...published, repository: { ...published.repository, id: 99 } },
    { ...published, issue: { number: 1, url: 'https://evil.test/issue' } },
    { ...published, draftId: 'another' },
  ]) {
    await assert.rejects(
      browserApi(async () => value).publishFormAssignment(preview.draft),
      { code: 'assignment-unconfirmed' }
    );
  }
  const unsafePreview = {
    ...preview,
    draft: {
      ...preview.draft,
      vacancyEvidence: { url: 'https://evil.test/vacancy/123' },
    },
  };
  await assert.rejects(
    browserApi(async () => unsafePreview).draftFormAssignment(env.input)
  );
  await assert.rejects(
    browserApi(async () => null).draftFormAssignment(env.input),
    { code: 'assignment-unconfirmed' }
  );
});

test('assignment publishing is visible only with an actual server capability in all four languages', async (t) => {
  const env = await assignmentPublisherFixture();
  t.after(env.publisher.stop);
  const props = {
    api: browserApi(async () => null),
    inspection: env.inspection,
    assignment: env.assignment,
    busy: false,
    setBusy: () => {},
    onLinked: () => {},
  };
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const render = (publishing) =>
      renderToStaticMarkup(
        React.createElement(
          LocaleContext.Provider,
          { value: { locale, t: (key, vars) => translate(locale, key, vars) } },
          React.createElement(FormAssignmentControl, { ...props, publishing })
        )
      );
    assert.ok(render(true).includes('data-assignment-publisher'));
    assert.ok(!render(false).includes('data-assignment-publisher'));
    assert.ok(!render(true).includes('assignment.title'));
  }
});
