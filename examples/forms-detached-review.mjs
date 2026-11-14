/** Synthetic demonstration and regression: detached CLI review, stable learning, reuse and owner submission. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import * as bc from 'browser-commander';
import { launchPersistentBrowser } from '../js/src/cv/persistent-browser.js';
import { startFormsFixture } from '../experiments/issue-56/forms-reader-fixture.mjs';
import { manageFormWatcher } from '../js/src/forms/watcher-management.js';
import { openDualStore } from '../js/src/storage/dual-store.js';
import { listAnswerRules } from '../js/src/automation/question-store.js';

const until = async (read, description, attempts = 200) => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const value = await read();
    if (value) {
      return value;
    }
    await delay(100);
  }
  throw new Error(`Missing ${description}`);
};
const startCli = (args, directory, filename = 'cli.log') => {
  const child = spawn(process.execPath, ['js/bin/meta-sovereign.js', ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const output = [];
  const log = [];
  const closed = new Promise((resolve) =>
    child.once('close', (code) => resolve(code))
  );
  child.stderr.on('data', (chunk) => log.push(String(chunk)));
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    log.push(line);
    try {
      output.push(JSON.parse(line));
    } catch {
      /* Runtime diagnostics remain in the evidence log. */
    }
  });
  return {
    child,
    closed,
    output,
    next: () => until(() => output.shift(), 'CLI response'),
    send: (line) => child.stdin.write(`${line}\n`),
    save: () => fs.writeFile(path.join(directory, filename), log.join('\n')),
  };
};

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-watch-cli-'));
const fixture = await startFormsFixture();
const profileDir = path.join(
  directory,
  'browser-profiles',
  'forms-review',
  'form-1'
);
let browser;
let cli;
let owned;
try {
  browser = await launchPersistentBrowser({
    bc,
    profileDir,
    headless: true,
    idleMs: 86400000,
    ...(process.env.E2E_EXECUTABLE_PATH
      ? { executablePath: process.env.E2E_EXECUTABLE_PATH }
      : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const url = fixture.url.replace('/application', '/learning');
  cli = startCli(
    ['forms-review', `--url=${url}`, `--store=${directory}`, '--headless'],
    directory
  );
  owned = await cli.next();
  assert.equal(owned.session.answerLearning.lifetime, 'detached');
  assert.equal(owned.session.watcher.state, 'active');
  assert.notEqual(owned.session.watcher.pid, cli.child.pid);
  await cli.next();
  cli.send('plan form-1');
  const first = await cli.next();
  assert.equal(first.mode, 'answer-plan');
  await browser.page
    .locator('textarea')
    .fill('I build reliable storage systems across runtimes.');
  await browser.page.locator('#next').click();
  await browser.page.waitForURL('**/learning?page=2');
  cli.send('plan form-1');
  assert.equal((await cli.next()).mode, 'answer-plan');
  await browser.page
    .locator('textarea')
    .fill('I can discuss a start date after the final interview.');
  await browser.page.screenshot({
    path: 'docs/screenshots/issue-56-forms-watcher-before.png',
  });
  cli.send('quit');
  cli.child.stdin.end();
  assert.equal(await cli.closed, 0);
  await cli.save();
  const status = await manageFormWatcher({ directory, slot: 'form-1' });
  assert.equal(status.watcher.state, 'active');
  assert.equal(status.answerLearning.tracked, 2);
  assert.equal(fixture.submits, 0);
  assert.equal(
    await browser.page.locator('textarea').inputValue(),
    'I can discuss a start date after the final interview.'
  );
  const stable = await until(
    async () => {
      const result = await manageFormWatcher({ directory, slot: 'form-1' });
      return result.answerLearning.saved === 1 ? result : null;
    },
    'one unchanged minute of detached owner editing',
    750
  );
  assert.equal(stable.answerLearning.last.kind, 'stable-owner-edit');
  assert.equal(fixture.submits, 0);
  cli = startCli(
    ['forms-review', `--url=${url}`, `--store=${directory}`, '--headless'],
    directory,
    'reattached-cli.log'
  );
  const reattached = await cli.next();
  assert.equal(reattached.session.watcher.pid, status.watcher.pid);
  assert.equal(reattached.session.url, `${url}?page=2`);
  assert.equal(
    await browser.page.evaluate(
      () =>
        Object.getOwnPropertyNames(globalThis).filter((name) =>
          name.startsWith('__formMonitor_')
        ).length
    ),
    1
  );
  assert.equal(
    await browser.page.locator('textarea').inputValue(),
    'I can discuss a start date after the final interview.'
  );
  await cli.next();
  await browser.page.getByRole('button', { name: 'Gửi', exact: true }).click();
  await browser.page.getByRole('status').waitFor();
  await until(
    async () =>
      (await manageFormWatcher({ directory, slot: 'form-1' })).answerLearning
        .saved === 2,
    'two detached actual-answer proposals'
  );
  await browser.page.screenshot({
    path: 'docs/screenshots/issue-56-forms-watcher-after.png',
  });
  const history = await manageFormWatcher({
    directory,
    slot: 'form-1',
    action: 'history',
  });
  const store = await openDualStore(directory, { readOnly: true });
  let rules;
  try {
    rules = await listAnswerRules(store);
  } finally {
    await store.close();
  }
  assert.equal(rules.length, 2);
  assert(
    rules.every(
      (rule) =>
        rule.answers[0].approved === false && rule.answers[0].count === 1
    )
  );
  assert.equal(fixture.submits, 1);
  cli.send('quit');
  cli.child.stdin.end();
  assert.equal(await cli.closed, 0);
  await cli.save();
  const stopped = await manageFormWatcher({
    directory,
    slot: 'form-1',
    action: 'stop',
  });
  assert.equal(stopped.state, 'stopped');
  const savedHistory = await manageFormWatcher({
    directory,
    slot: 'form-1',
    action: 'history',
  });
  assert.equal(savedHistory.source, 'saved-checkpoints');
  assert(savedHistory.checkpoints.some(({ action }) => action === 'plan'));
  assert(savedHistory.checkpoints.some(({ action }) => action === 'learn'));
  console.log(
    JSON.stringify(
      {
        ok: true,
        initiatingCliExited: true,
        beforeSubmit: status,
        stableBeforeSend: stable,
        reusedWatcher: reattached.session,
        history,
        rules,
        stopped,
        savedHistory,
        submits: fixture.submits,
      },
      null,
      2
    )
  );
} finally {
  if (cli && cli.child.exitCode === null) {
    cli.child.kill('SIGTERM');
    await cli.closed;
  }
  await cli?.save();
  await manageFormWatcher({ directory, slot: 'form-1', action: 'stop' }).catch(
    () => {}
  );
  await browser?.close();
  await fixture.close();
  if (process.env.KEEP_FORMS_WATCHER_FIXTURE === '1') {
    console.log(`Fixture: ${directory}`);
  } else {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
