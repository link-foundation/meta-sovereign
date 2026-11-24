import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';

const inspect = async (page, { base, control, screens }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  const open = async (disclosure) => {
    if (!(await disclosure.evaluate((node) => node.open))) {
      await disclosure.locator(':scope > summary').click();
    }
  };
  await page.goto(`${base}/#/automation`);
  const panel = page.locator('[data-question-controls]');
  await open(panel);
  const policy = panel.locator('[data-answer-policy]');
  await open(policy);
  const fields = policy.locator('[data-notice-policies]');
  const mode = fields.getByLabel('Application acknowledgements', {
    exact: true,
  });
  if (!(await mode.isEnabled())) {
    await policy
      .getByRole('button', { name: 'Refresh answers', exact: true })
      .click();
  }
  if ((await mode.inputValue()) !== 'review') {
    throw new Error('Review is not the initial policy');
  }
  await mode.selectOption('reply-recognized');
  await policy.getByRole('button', { name: 'Save', exact: true }).click();
  await policy
    .getByText('Answer reuse policy saved.', { exact: true })
    .waitFor();
  const read = async () => (await page.request.get(control)).json();
  const before = await read();
  if (before.opens || before.sends || before.outbox) {
    throw new Error('Saving policy started a provider operation');
  }
  await mode.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screens.policy });
  const controls = panel.locator('[data-browser-answer-controls]');
  await open(controls);
  await controls.getByLabel('Web-chat reference', { exact: true }).fill('7');
  await controls.locator('[data-browser-answer-inspect]').click();
  await controls.locator('[data-browser-answer-review]').waitFor();
  const watch = controls.locator('[data-browser-answer-watch]');
  await watch.locator('[data-notice-watch-mode]').check();
  await watch.locator('[data-browser-watch-start]').click();
  const receipt = watch.getByText('Provider message receipt: 102', {
    exact: true,
  });
  await receipt.waitFor();
  const reason = watch.getByText(
    'The saved notice policy authorized these approved thanks for a recognized application update.',
    { exact: true }
  );
  await reason.waitFor();
  await receipt.scrollIntoViewIfNeeded();
  await page.screenshot({ path: screens.receipt });
  await watch.locator('[data-browser-watch-stop]').click();
  await watch.locator('[data-browser-watch-state="stopped"]').waitFor();
  const after = await read();
  if (
    after.opens !== 1 ||
    after.sends !== 1 ||
    after.outbox !== 1 ||
    pageErrors.length
  ) {
    throw new Error(JSON.stringify({ before, after, pageErrors }));
  }
  return { before, after, pageErrors, stopped: true, liveProvider: false };
};

const raw = await readFile('ci-logs/notice-recognized-mcp-server.log', 'utf8');
const directory = 'docs/screenshots/issue-56/notice-recognized';
await writeFile(
  'ci-logs/notice-recognized-mcp-code.js',
  mcpInspectionCode(inspect, {
    ...JSON.parse(raw.split('\n')[0]),
    screens: {
      policy: resolve(directory, 'policy-phone.png'),
      receipt: resolve(directory, 'receipt-phone.png'),
    },
  })
);
