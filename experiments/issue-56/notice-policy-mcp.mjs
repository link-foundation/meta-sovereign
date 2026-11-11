import { readFile, writeFile } from 'node:fs/promises';

// Independent MCP inspection of the actual shared React controls. The tiny
// server uses a synthetic provider: native dispatch is tested separately.
const inspect = async (page, { base, control, screenshots }) => {
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const check = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  const open = async (node) => {
    if (!(await node.evaluate((element) => element.open))) {
      await node.locator(':scope > summary').click();
    }
  };
  await page.setViewportSize({ width: 1180, height: 950 });
  await page.addInitScript(() => {
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignOperatorScope',
      JSON.stringify({ private: true, bot: true, group: false, channel: false })
    );
  });
  await page.goto(`${base}/?mcp=policy#/automation`);
  const panel = page.locator('[data-question-controls]');
  const policy = panel.locator('[data-answer-policy]');
  await open(panel);
  await open(policy);
  const fields = policy.locator('[data-notice-policies]');
  await fields.waitFor();
  check(
    JSON.stringify(
      await fields
        .locator('select')
        .evaluateAll((nodes) => nodes.map((node) => node.value))
    ) === JSON.stringify(['review', 'review', 'review']),
    'Default policies must require review'
  );
  await fields
    .getByLabel('Application acknowledgements', { exact: true })
    .selectOption('reply');
  await fields.getByLabel('Rejections', { exact: true }).selectOption('reply');
  await fields
    .getByLabel('Invitations', { exact: true })
    .selectOption('ignore');
  check(
    (await fields
      .getByLabel('Invitations', { exact: true })
      .locator('option')
      .count()) === 2,
    'Invitations have no automatic acceptance'
  );
  await fields
    .getByLabel('Reply asking for the rejection reason', { exact: true })
    .fill('May I ask why?');
  await policy.getByRole('button', { name: 'Save', exact: true }).click();
  await policy
    .getByText('Answer reuse policy saved.', { exact: true })
    .waitFor();
  await fields.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${screenshots}/mcp-settings-after.png` });
  await page.goto(`${base}/?mcp=persisted#/automation`);
  await open(panel);
  await open(policy);
  await fields.waitFor();
  check(
    JSON.stringify(
      await fields
        .locator('select')
        .evaluateAll((nodes) => nodes.map((node) => node.value))
    ) === JSON.stringify(['reply', 'reply', 'ignore']),
    'Saved decisions must survive navigation'
  );
  check(
    (await fields.locator('textarea').inputValue()) === 'May I ask why?',
    'Configured reply must persist'
  );
  const controls = panel.locator('[data-browser-answer-controls]');
  await open(controls);
  await controls.getByLabel('Web-chat reference', { exact: true }).fill('7');
  await controls.locator('[data-browser-answer-inspect]').click();
  await controls.locator('[data-browser-answer-review]').waitFor();
  check(
    !(await controls.locator('[data-notice-watch-mode]').isChecked()),
    'Notice watch must remain explicitly selected'
  );
  await page.request.get(`${control}/unread`);
  await page.goto(`${base}/?mcp=operator#/operator?chat=hh%3A7`);
  await page.locator('[data-action="chat-automations"]').click();
  const shared = page.locator('.chat-menu-list [data-browser-answer-controls]');
  await open(shared);
  await shared.locator('[data-notice-watch-mode]').waitFor();
  check(
    !(await shared.locator('[data-notice-watch-mode]').isChecked()),
    'Operator must not resume a notice watch'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await shared.locator('[data-notice-watch-mode]').scrollIntoViewIfNeeded();
  const checkbox = shared.locator('[data-notice-watch-mode]');
  check(
    (await checkbox.boundingBox()).width <= 24,
    'Checkbox must keep its native width'
  );
  check(
    (await checkbox.locator('..').boundingBox()).height < 100,
    'Checkbox label must remain readable'
  );
  await page.screenshot({
    path: `${screenshots}/mcp-operator-mobile-after.png`,
  });
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'Mobile controls must fit'
  );
  const counts = await (await page.request.get(control)).json();
  check(
    counts.opens === 0 && counts.sends === 0,
    'Saving or navigating must not open a watch or send'
  );
  check(errors.length === 0, 'No page errors');
  return {
    cases: 3,
    ...counts,
    pageErrors: errors,
    nativeProvider: false,
    liveProvider: false,
  };
};

const fixture = JSON.parse(
  (await readFile('ci-logs/notice-policy-mcp-server.log', 'utf8')).trim()
);
await writeFile(
  'ci-logs/notice-policy-mcp-code.js',
  `async (page) => (${inspect.toString()})(page, ${JSON.stringify({ ...fixture, screenshots: '/tmp/gh-issue-solver-1794216540735/docs/screenshots/issue-56-notice-policy' })})`
);
