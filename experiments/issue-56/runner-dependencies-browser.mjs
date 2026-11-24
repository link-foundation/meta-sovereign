import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { verifyRunnerDependencyRefusals } from '../../js/tests/helpers/e2e-runner-feedback.mjs';
import { runnerDependencyRefusalFixture } from './runner-api-fixture.mjs';

if (process.argv.includes('--serve')) {
  const fixture = await runnerDependencyRefusalFixture();
  try {
    console.log(fixture.base);
    await once(process, 'SIGTERM');
  } finally {
    await fixture.close();
  }
} else {
  const parent = process.argv.includes('--parent');
  const options = {
    screenshots: 'docs/screenshots/issue-56-runner-dependencies',
  };
  if (parent) {
    options.beforeBundle = execFileSync(
      'git',
      ['show', '2810a508:js/src/web/app.min.js'],
      { maxBuffer: 16 * 1024 ** 2 }
    );
  }
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_EXECUTABLE_PATH,
  });
  try {
    if (parent) {
      await assert.rejects(
        verifyRunnerDependencyRefusals(browser, options),
        (error) =>
          error.code === 'ERR_ASSERTION' &&
          error.actual?.length === 2 &&
          error.actual.every((message) =>
            /^The action was not confirmed\./.test(message)
          ) &&
          /^Could not prepare Node\.js/.test(error.expected?.[0]) &&
          /^Could not prepare the isolated session launcher/.test(
            error.expected?.[1]
          )
      );
      console.log(JSON.stringify({ parentUsedGenericNotice: true }));
    } else {
      console.log(
        JSON.stringify(await verifyRunnerDependencyRefusals(browser, options))
      );
    }
  } finally {
    await browser.close();
    console.log(JSON.stringify({ resourcesClosed: true }));
  }
}
