import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { lstat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  captureVkAutomationLayouts,
  vkAutomationBrowser,
} from '../../js/tests/helpers/vk-automation-browser.mjs';
import { runnerApiFixture } from './runner-api-fixture.mjs';
import { runnerDeploymentFixture } from './runner-deployment-fixture.mjs';

const [, , variant, ref] = process.argv;
const before = variant === '--before';
const source = await runnerDeploymentFixture();
let fixture;
try {
  const { session, ...local } = source.target;
  fixture = await runnerApiFixture({
    initial: { server: 'running' },
    overlay: { session, local },
    control: { prepareSource: source.prepareSource },
  });
  if (variant === '--serve') {
    console.log(JSON.stringify({ origin: fixture.base, pid: process.pid }));
    await once(process, 'SIGTERM');
  } else {
    await runBrowserScenarios('runner-source-preview', [
      async (browser) => {
        const { context, page, errors } = await vkAutomationBrowser(
          browser,
          '',
          fixture.base
        );
        const screens = 'docs/screenshots/issue-56-runner-source-deployment';
        const actions = [];
        page.on('request', (request) => {
          if (/\/api\/runner\/deploy(?:-plan)?(?:\?|$)/u.test(request.url())) {
            actions.push(request.method());
          }
        });
        try {
          if (before) {
            assert.match(ref ?? '', /^[a-f0-9]{40}$/u);
            const { stdout: body } = await promisify(execFile)(
              'git',
              ['show', `${ref}:js/src/web/app.min.js`],
              { maxBuffer: 12 * 1024 * 1024 }
            );
            await page.route('**/app.min.js*', (route) =>
              route.fulfill({ contentType: 'text/javascript', body })
            );
          }
          await page.goto(`${fixture.base}/#settings`);
          await page.locator('[data-runner-open]').click();
          await page.locator('[data-runner-profile-open]').click();
          const editor = page.locator('[data-runner-profile-editor]');
          await editor.and(page.locator('[aria-busy=false]')).waitFor();
          const draft = editor.locator('[data-runner-profile-document]');
          const saved = await draft.inputValue();
          assert.match(saved, /applicationSource/u);
          const section = editor.locator('[data-runner-deployment=local]');
          if (before) {
            assert.equal(await section.count(), 0);
            await captureVkAutomationLayouts(
              page,
              editor,
              screens,
              'before',
              true
            );
            assert.deepEqual(actions, []);
          } else {
            const review = section.getByRole('button', {
              name: 'Review application source',
            });
            const prepare = section.getByRole('button', {
              name: 'Prepare reviewed source',
            });
            await draft.fill(`${saved}\n`);
            assert.equal(await review.isEnabled(), false);
            await draft.fill(saved);
            await review.click();
            const plan = section.locator('[data-runner-source-plan]');
            await plan.waitFor();
            const evidence = await plan.innerText();
            const [, archiveDigest] =
              source.recipe.applicationSource.split('@');
            for (const value of [
              source.target.directory,
              archiveDigest,
              source.recipe.applicationLock,
              'https://github.com/link-foundation/meta-sovereign/releases/download/',
            ]) {
              assert.ok(evidence.includes(value));
            }
            assert.equal(source.downloads(), 0);
            await assert.rejects(lstat(source.target.directory), {
              code: 'ENOENT',
            });
            await captureVkAutomationLayouts(
              page,
              section,
              screens,
              'review',
              true
            );
            await prepare.click();
            const status = section.getByRole('status');
            await status
              .getByText('Application source prepared.', { exact: false })
              .waitFor();
            assert.equal(await prepare.count(), 0);
            assert.equal(source.downloads(), 1);
            assert.equal(
              (await lstat(source.target.directory)).isSymbolicLink(),
              true
            );
            assert.deepEqual(actions, ['GET', 'POST']);
            await captureVkAutomationLayouts(
              page,
              section,
              screens,
              'after',
              true
            );
          }
          assert.deepEqual(errors, []);
          return { before, actions, downloads: source.downloads() };
        } finally {
          await context.close();
        }
      },
    ]);
  }
} finally {
  try {
    await fixture?.close();
  } finally {
    await source.close();
  }
  assert.equal(fixture?.backend.state.server, 'running');
  assert.deepEqual(
    fixture?.backend.calls.filter(([, action]) => action !== 'probe'),
    []
  );
  console.log(
    JSON.stringify({
      peerRunning: true,
      downloads: source.downloads(),
      resourcesClosed: true,
    })
  );
}
