// Real browser e2e for block, contacts and report in the info column
// (R-Y128), as Telegram Desktop offers them: "Block user" is asked in the
// page and then reads "Unblock user" (which acts at once); "Add to
// contacts" opens a dialog with the name prefilled and a share-my-number
// box, "Delete contact" is asked; "Report spam" shows for a stranger;
// "Report" walks Telegram's own list (a list, a narrower list, a comment,
// the end), in a group too. Telegram's answers faked in the page, a fake
// chat in a memory store, a server on a free port, a headless browser;
// nothing reaches a network or a running app. Not part of `npm test`; run
// it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:peer-actions

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const PERSON = '42';
const GROUP = '-1005';
const store = createMemoryStore();
const put = (chat, name, type) =>
  store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender: chat,
    senderName: name,
    body: 'hello',
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    raw: { id: 1 },
  });
await put(PERSON, 'Ann Lee', 'private');
await put(GROUP, 'Fake Group', 'supergroup');

const { base, page, until, finish } = await openChatApp('peer-actions', {
  store,
});
page.on('dialog', (dialog) => {
  throw new Error(`the browser's own dialog: ${dialog.message()}`);
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/people/learned*', (route) =>
  fulfil(route, { complete: true, messages: 1 })
);
await page.route('**/api/telegram/members', (route) =>
  fulfil(route, { ok: true, total: 0, members: [], canBan: false })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(
    route,
    chat === PERSON
      ? {
          chat,
          kind: 'user',
          title: 'Ann Lee',
          members: 1,
          blocked: false,
          contact: false,
        }
      : { chat, kind: 'group', title: 'Fake Group', members: 3 }
  );
});

const calls = [];
const answers = {
  'peer-block': (b) => ({ ok: true, blocked: b.block }),
  'peer-contact': (b) => ({ ok: true, contact: b.add }),
  'peer-report-spam': () => ({ ok: true }),
};
for (const [name, answer] of Object.entries(answers)) {
  await page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON();
    calls.push([name, body]);
    return fulfil(route, answer(body));
  });
}
// The report: reasons, then a narrower list, then words, then the end.
const reports = [];
await page.route('**/api/telegram/peer-report', (route) => {
  const body = route.request().postDataJSON();
  reports.push(body);
  if (!body.option) {
    return fulfil(route, {
      ok: true,
      result: 'choose',
      title: 'Why are you reporting?',
      options: [
        { text: 'Spam', option: 'AQ==' },
        { text: 'Other', option: 'Ag==' },
      ],
    });
  }
  if (body.option === 'AQ==') {
    return fulfil(route, {
      ok: true,
      result: 'choose',
      title: 'What kind of spam?',
      options: [{ text: 'Ads', option: 'Aw==' }],
    });
  }
  if (body.option === 'Aw==' && body.message === undefined) {
    return fulfil(route, {
      ok: true,
      result: 'comment',
      optional: false,
      option: 'Aw==',
    });
  }
  return body.message === 'bad'
    ? fulfil(route, { ok: true, result: 'reported' })
    : fulfil(route, { ok: false, code: 'bad-option' });
});

const panel = page.locator('.person-panel .peer-actions');
const act = (name) => panel.locator(`[data-action="${name}"]`);
const dialog = (name) => page.locator(`[data-dialog="${name}"]`);
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);

// Report: the list, a narrower list, words, the end; then a group's.
const walkReport = async () => {
  await act('report').click();
  const report = dialog('report');
  await report.locator('[data-action="report-reason"]').first().waitFor();
  assert(
    (await report.textContent()).includes('Why are you reporting?'),
    'the title from Telegram'
  );
  assert(!reports[0].option, 'the first ask has no option');
  await report.locator('[data-action="report-reason"]').first().click();
  await report.getByText('What kind of spam?').waitFor({ timeout: 5000 });
  await report.locator('[data-action="report-reason"]').first().click();
  const words = report.locator('.peer-comment');
  await words.waitFor({ timeout: 5000 });
  assert(
    await report.locator('[data-action="report-send"]').isDisabled(),
    'words are required'
  );
  await words.fill('bad');
  await report.locator('[data-action="report-send"]').click();
  await report.locator('[data-report="done"]').waitFor({ timeout: 5000 });
  assert(
    reports.at(-1).option === 'Aw==' && reports.at(-1).message === 'bad',
    `sent: ${JSON.stringify(reports.at(-1))}`
  );
  await report.locator('[data-action="cancel"]').click();
  await gone(report, 'closed');

  // A group: Report only.
  await page.locator(`[data-chat="telegram:${GROUP}"]`).click();
  await panel.locator('[data-action="report"]').waitFor({ timeout: 10000 });
  assert(
    (await panel.locator('[data-action="block"]').count()) === 0,
    'no Block in a group'
  );
  await panel.locator('[data-action="report"]').click();
  await dialog('report').waitFor({ timeout: 5000 });
  assert(reports.at(-1).chat === GROUP, 'the group reported');
};

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${PERSON}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
  await act('block').waitFor({ timeout: 10000 });
  assert((await act('contact-add').count()) === 1, 'Add to contacts shows');
  assert((await act('report-spam').count()) === 1, 'Report spam: a stranger');

  // Block: asked in the page; Cancel does nothing; Block goes, then Unblock.
  await act('block').click();
  await dialog('block').waitFor({ timeout: 5000 });
  assert((await dialog('block').textContent()).includes('Ann Lee'), 'names');
  await dialog('block').locator('[data-action="cancel"]').click();
  await gone(dialog('block'), 'Cancel closes');
  assert(calls.length === 0, 'nothing blocked on Cancel');
  await act('block').click();
  await dialog('block').locator('[data-action="block-confirm"]').click();
  await gone(dialog('block'), 'closed after Block');
  assert(
    calls.length === 1 &&
      calls[0][0] === 'peer-block' &&
      calls[0][1].chat === PERSON &&
      calls[0][1].block === true,
    `blocked: ${JSON.stringify(calls)}`
  );
  await act('unblock').waitFor({ timeout: 5000 });
  assert((await act('block').count()) === 0, 'Block is gone');
  await act('unblock').click();
  await act('block').waitFor({ timeout: 5000 });
  assert(calls[1][1].block === false, 'unblocked at once');

  // Add to contacts: the name prefilled, the box ticked.
  await act('contact-add').click();
  const add = dialog('contact-add');
  await add.waitFor({ timeout: 5000 });
  assert(
    (await add.locator('[data-field="first"]').inputValue()) === 'Ann' &&
      (await add.locator('[data-field="last"]').inputValue()) === 'Lee',
    'name prefilled'
  );
  await add.locator('[data-field="last"]').fill('Smith');
  await add.locator('[data-field="share"]').check();
  await add.locator('[data-action="contact-add-confirm"]').click();
  await gone(add, 'closed after Add');
  const added = calls.at(-1)[1];
  assert(
    calls.at(-1)[0] === 'peer-contact' &&
      added.add === true &&
      added.firstName === 'Ann' &&
      added.lastName === 'Smith' &&
      added.share === true,
    `added: ${JSON.stringify(added)}`
  );
  await act('contact-delete').waitFor({ timeout: 5000 });
  assert((await act('report-spam').count()) === 0, 'no spam for a contact');

  // Delete contact: asked first.
  await act('contact-delete').click();
  await dialog('contact-delete').waitFor({ timeout: 5000 });
  await dialog('contact-delete').locator('[data-action="cancel"]').click();
  await gone(dialog('contact-delete'), 'Cancel closes');
  await act('contact-delete').click();
  await dialog('contact-delete')
    .locator('[data-action="contact-delete-confirm"]')
    .click();
  await act('contact-add').waitFor({ timeout: 5000 });
  assert(
    calls.at(-1)[0] === 'peer-contact' && calls.at(-1)[1].add === false,
    'deleted'
  );

  // Report spam.
  await act('report-spam').click();
  await dialog('spam').locator('[data-action="spam-confirm"]').click();
  await gone(dialog('spam'), 'closed after Report spam');
  assert(calls.at(-1)[0] === 'peer-report-spam', 'spam reported');
  await walkReport();
});
