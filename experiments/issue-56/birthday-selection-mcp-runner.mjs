import { readFile, writeFile } from 'node:fs/promises';
import { encodeWire, LINO_TEXT } from '../../js/src/transport/lino.js';
import { verifyBirthdayReloadSelection } from '../../js/tests/helpers/profile-birthday-selection.mjs';

const { base } = JSON.parse(
  (await readFile('ci-logs/birthday-selection-mcp-server.log', 'utf8')).split(
    '\n'
  )[0]
);
const values = {
  status: { connected: true, kind: 'user', account: { username: 'owner' } },
  history: { written: 0, cached: 0, complete: true },
  calls: { ok: true, calls: [], next: null },
  birthdays: {
    ok: true,
    birthdays: [
      { chat: '43', name: 'Bob Ray', day: 10, month: 11 },
      { chat: '45', name: 'Eve Bell', day: 10, month: 11 },
    ],
  },
};
const replies = Object.fromEntries(
  Object.entries(values).map(([key, value]) => [
    key,
    {
      contentType: LINO_TEXT,
      body: encodeWire(value),
    },
  ])
);
const verify = async (page, base, replies) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('about:blank');
  await page.clock.setFixedTime(new Date(2026, 10, 10, 12));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      '{"off":true,"v":5}'
    );
  });
  for (const name of ['status', 'history', 'calls']) {
    await page.route(`**/api/telegram/${name}`, (route) =>
      route.fulfill(replies[name])
    );
  }
  const replyContacts = (route) => route.fulfill(replies.birthdays);
  await page.route('**/api/telegram/contact-birthdays', replyContacts);
  await page.goto(`${base}/#chat=telegram:43`);
  await page
    .locator('[data-chat="telegram:43"][aria-current="true"]')
    .waitFor();
  await page
    .locator('[data-birthdays-state="ready"]')
    .waitFor({ state: 'attached', timeout: 10000 });
  await verifyBirthdayReloadSelection(page, { replyContacts });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'docs/screenshots/issue-56-birthday-selection/mcp-phone.png',
  });
  return {
    selected: await page
      .locator('[data-chat][aria-current="true"]')
      .getAttribute('data-chat'),
    birthdayState: await page
      .locator('[data-birthdays-state]')
      .getAttribute('data-birthdays-state'),
    pageErrors: errors,
    liveProvider: false,
  };
};
const code = `async (page) => {
 const assert = Object.assign(value => { if(!value) throw new Error('Missing browser control'); },
  { equal(a,b) { if(a !== b) throw new Error('Browser assertion failed'); } });
 const gate = () => { let resolve; const promise = new Promise(r => resolve=r); return {resolve,promise}; };
 const process = { env: {} };
 const mkdir = async () => {};
 const join = (...parts) => parts.join('/');
 const verifyBirthdayReloadSelection = ${verifyBirthdayReloadSelection.toString()};
 return (${verify.toString()})(page, ${JSON.stringify(base)}, ${JSON.stringify(replies)});
}`;
await writeFile('ci-logs/birthday-selection-mcp-code.js', code);
