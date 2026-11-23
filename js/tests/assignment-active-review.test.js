import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormReader } from '../src/forms/reader.js';
import { testAssignmentCommand } from '../src/cli/test-assignment-command.js';
import { parseArgs } from '../src/cli/lino-args.js';
import { cliServerClient } from '../src/cli/server-lino-client.js';
import { LINO_TEXT } from '../src/transport/lino.js';
import { assignmentPublisherFixture } from '../../experiments/issue-56/assignment-publisher-fixture.mjs';
import { assignmentTask } from '../../experiments/issue-56/forms-assignment-fixture.mjs';
import { reviewBrowser } from './helpers/forms-session-fixture.mjs';
import { formReviewHttp } from './helpers/forms-review-http.mjs';

const activeUrl = 'https://form.example.test/read-assignment';
const planTarget = {
  target: 'fixture-owner/reviewed-task',
  visibility: 'private',
};
const ownedBrowser = (task = assignmentTask) => {
  const browser = reviewBrowser();
  const evaluate = browser.commander.evaluate;
  browser.setTask = (value) => {
    task = value;
  };
  browser.commander.evaluate = async (request) => ({
    ...(await evaluate(request)),
    intro: task,
  });
  return browser;
};
const activeOptions = (env, browsers) => ({
  store: env.store,
  assignmentGithub: env.github,
  modelRunner: env.modelRunner,
  openSession: async ({ slot }) => browsers[slot],
  review: { learn: false },
});

test('active assignment review reads a named owned slot at its current page without replacing the browser', async (t) => {
  const env = await assignmentPublisherFixture();
  const first = ownedBrowser();
  const second = ownedBrowser(
    'Other required test assignment for another slot.'
  );
  const reader = createFormReader(activeOptions(env, { first, second }));
  t.after(async () => {
    await reader.stop();
    await env.publisher.stop();
  });
  await reader.openReview({ url: activeUrl, browserSlot: 'first' });
  await reader.openReview({ url: `${activeUrl}?other`, browserSlot: 'second' });
  first.navigate(`${activeUrl}?owner-current`);
  const preview = await reader.draftAssignment({
    ...planTarget,
    reviewSlot: 'first',
  });
  assert.equal(preview.draft.formUrl, `${activeUrl}?owner-current`);
  assert.match(
    env.state.modelCalls[0].prompt,
    /design a small inventory service/u
  );
  assert.equal(reader.listReviews().sessions.length, 2);
  assert.deepEqual(first.calls, [['goto', activeUrl]]);
  assert.deepEqual(second.calls, [['goto', `${activeUrl}?other`]]);
  const restored = await reader.restoreAssignment({ reviewSlot: 'first' });
  assert.deepEqual(restored.draft, preview.draft);
  assert.equal(env.state.modelCalls.length, 1);
  assert.equal(env.state.calls.includes('create'), false);
});

test('active assignment review has a unique automatic match and refuses ambiguous or missing slots', async (t) => {
  const env = await assignmentPublisherFixture();
  const first = ownedBrowser();
  const second = ownedBrowser('A plain application without an exercise.');
  const reader = createFormReader(activeOptions(env, { first, second }));
  t.after(async () => {
    await reader.stop();
    await env.publisher.stop();
  });
  await assert.rejects(
    reader.draftAssignment({ ...planTarget, reviewSlot: null }),
    { code: 'assignment-review-missing' }
  );
  await reader.openReview({ url: activeUrl, browserSlot: 'first' });
  await reader.openReview({ url: `${activeUrl}?other`, browserSlot: 'second' });
  const preview = await reader.draftAssignment({
    ...planTarget,
    reviewSlot: null,
  });
  assert.equal(preview.draft.formUrl, activeUrl);
  second.setTask('New test assignment about a totally different page.');
  await assert.rejects(
    reader.draftAssignment({ ...planTarget, reviewSlot: null }),
    { code: 'assignment-review-ambiguous' }
  );
  await assert.rejects(
    reader.draftAssignment({ ...planTarget, reviewSlot: 'third' }),
    { code: 'assignment-review-missing' }
  );
  assert.equal(env.state.modelCalls.length, 1);
});

test('active assignment review refuses drafting against a changed Forms inspection', async (t) => {
  const env = await assignmentPublisherFixture();
  const browser = ownedBrowser();
  const reader = createFormReader(activeOptions(env, { assignment: browser }));
  t.after(async () => {
    await reader.stop();
    await env.publisher.stop();
  });
  const { session } = await reader.openReview({
    url: activeUrl,
    browserSlot: 'assignment',
  });
  const inspection = await reader.readReview(session.id);
  const plan = await reader.plan({ inspection });
  const revision = plan.planning.assignment.revision;
  const input = { ...planTarget, inspection, revision, reviewId: session.id };
  browser.setTask('New test assignment content requires a fresh owner review.');
  await assert.rejects(reader.draftAssignment(input), {
    code: 'assignment-review-changed',
  });
  assert.deepEqual(env.state.calls, []);
  browser.setTask(assignmentTask);
  const preview = await reader.draftAssignment(input);
  assert.equal(preview.draft.formUrl, activeUrl);
  assert.equal(preview.draft.assignmentRevision, revision);
  assert.equal(
    (await reader.restoreAssignment(input)).draft.id,
    preview.draft.id
  );
  assert.deepEqual(browser.calls, [['goto', activeUrl]]);
});

test(
  'active assignment review CLI uses the running server and recovers the same server draft',
  { timeout: 20000 },
  async (t) => {
    for (const binary of [false, true]) {
      const env = await assignmentPublisherFixture();
      t.after(env.publisher.stop);
      const browser = ownedBrowser();
      const { server, base } = await formReviewHttp(
        activeOptions(env, { assignment: browser }),
        LINO_TEXT
      );
      try {
        const request = cliServerClient(base, binary);
        const { answer: opened } = await request('/api/forms/sessions/open', {
          url: activeUrl,
          browserSlot: 'assignment',
        });
        assert.equal(opened.ok, true);
        const command = testAssignmentCommand({
          openStore: () => assert.fail('active review uses the owning store'),
        });
        const args = [`--server=${base}`, ...(binary ? ['--binary'] : [])];
        const logs = [];
        const log = (line) => logs.push(JSON.parse(line));
        assert.equal(
          await command(
            parseArgs([
              planTarget.target,
              '--dry-run',
              ...args,
              ...(binary ? ['--review-slot=assignment'] : []),
            ]),
            log
          ),
          0
        );
        const { draft } = logs.at(-1);
        assert.equal(draft.formUrl, activeUrl);
        assert.equal(env.state.calls.includes('create'), false);
        await assert.rejects(
          command(
            parseArgs([
              `--draft-id=${draft.id}`,
              '--review-slot=assignment',
              ...args,
            ]),
            log
          ),
          /saved assignment draft already fixes its Forms review/u
        );
        assert.equal(env.state.calls.includes('create'), false);
        assert.equal(
          await command(parseArgs([`--draft-id=${draft.id}`, ...args]), log),
          0
        );
        assert.equal(logs.at(-1).state, 'verified');
        assert.equal(
          env.state.calls.filter((call) => call === 'create').length,
          1
        );
        assert.equal(env.state.modelCalls.length, 1);
        assert.deepEqual(browser.calls, [['goto', activeUrl]]);
      } finally {
        await server.close();
      }
    }
  }
);
