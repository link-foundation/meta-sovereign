// Real browser e2e for mail that is shown safely (R-Z5): a fake chat in a
// memory store holds a parsed mail with a koi8-r and a windows-1251 subject,
// an HTML body with a <script>, an onerror handler, a remote picture and a
// cid picture, and a PDF attachment. The page must draw no script or
// handler, never ask for the remote picture, show the cid picture, decode
// the subject, offer the attachment as a download, and show a "Fetch mail
// now" button that calls the pull route (faked here). Nothing reaches a
// network. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:email
//   RUN_BROWSER_E2E=1 npm run test:e2e:email:webkit

import { createMemoryStore } from '../src/storage/universal.js';
import { parseRfc822Message } from '../src/sources/email-records.js';
import { stampSourceLink } from '../src/sources/index.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const HTML = [
  '<p>Hello <b>team</b></p>',
  '<script>window.__pwned = 1</script>',
  '<img src="cid:logo1" alt="logo">',
  '<img src="http://tracker.invalid/pixel.gif" alt="spy">',
  '<img src="x" onerror="window.__pwned = 2" alt="bad">',
  '<a href="javascript:window.__pwned = 3" onclick="window.__pwned = 4">trap</a>',
].join('');
const RAW = [
  'From: Boss <boss@example.com>',
  'To: me@example.com',
  // koi8-r then windows-1251, both "Привет".
  'Subject: =?koi8-r?B?8NLJ18XU?= =?windows-1251?Q?=CF=F0=E8=E2=E5=F2?=',
  'Date: Mon, 05 Jan 2026 10:00:00 +0000',
  'Message-ID: <e2e-1@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="Outer"',
  '',
  '--Outer',
  'Content-Type: multipart/related; boundary="Inner"',
  '',
  '--Inner',
  'Content-Type: text/html; charset=utf-8',
  '',
  HTML,
  '--Inner',
  'Content-Type: image/png',
  'Content-ID: <logo1>',
  'Content-Disposition: inline; filename="logo.png"',
  'Content-Transfer-Encoding: base64',
  '',
  PIXEL,
  '--Inner--',
  '--Outer',
  'Content-Type: application/pdf; name="plan.pdf"',
  "Content-Disposition: attachment; filename*=UTF-8''plan%20%D1%84.pdf",
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from('%PDF-1.4 fake').toString('base64'),
  '--Outer--',
  '',
].join('\r\n');

const store = createMemoryStore();
const { base, page, until, finish } = await openChatApp('email', { store });
// Parsed after the server started, so the attachment bytes are kept in its
// media folder.
const mail = stampSourceLink(parseRfc822Message(RAW), 'email');
await store.put(mail);

const requested = [];
page.on('request', (req) => requested.push(req.url()));
let pulls = 0;
await page.route('**/api/email/pull', (route) => {
  pulls += 1;
  return fulfil(route, { ok: true, imported: 3 });
});

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="email:${mail.chat}"]`).click();
  const body = page.locator('.email-html').first();
  await body.waitFor({ timeout: 15000 });

  assert((await body.locator('script').count()) === 0, 'no script element');
  const bad = await page.evaluate(
    () =>
      document.querySelectorAll('[onerror],[onclick],[onload]').length +
      document.querySelectorAll('a[href^="javascript:"]').length
  );
  assert(bad === 0, 'no handler attributes or javascript: links');
  assert(
    (await page.evaluate(() => window.__pwned)) === undefined,
    'nothing ran'
  );

  // The cid picture is shown from the server; the remote one is dropped.
  const logo = body.locator('img.email-img');
  await until(async () => (await logo.count()) === 1, 'one inline picture');
  await until(
    () => logo.evaluate((img) => img.complete && img.naturalWidth === 1),
    'cid picture loaded'
  );
  assert(
    (await logo.getAttribute('src')).includes('/api/email/attachment'),
    'cid picture comes from the attachment route'
  );
  assert(
    !requested.some((url) => url.includes('tracker.invalid')),
    'remote picture never requested'
  );

  // The subject is decoded from both charsets.
  const text = await page.locator('body').innerText();
  assert(
    text.includes('ПриветПривет'),
    `subject decoded: ${JSON.stringify(text.slice(0, 600))}`
  );

  // The attachment is offered as a download, served as an attachment.
  const link = page.locator('a.email-file-download').first();
  await link.waitFor({ timeout: 10000 });
  assert((await link.getAttribute('download')) !== null, 'download attr');
  const served = await page.evaluate(
    async (href) => {
      const got = await fetch(href);
      return [got.headers.get('content-disposition'), await got.text()];
    },
    await link.getAttribute('href')
  );
  assert(served[0].startsWith('attachment;'), `disposition: ${served[0]}`);
  assert(served[1].startsWith('%PDF'), 'attachment bytes');

  // "Fetch mail now" on the Email connection calls the pull route.
  await page.click('button[data-view="connections"]');
  await page.click(
    'article[data-provider-id="email"] button[data-action="open-connection-detail"]'
  );
  const button = page.locator('button[data-action="email-pull"]');
  await button.waitFor({ timeout: 10000 });
  await button.click();
  await until(() => pulls === 1, 'pull route called');
  await page.locator('[data-email-pull="done"]').waitFor({ timeout: 10000 });
});
