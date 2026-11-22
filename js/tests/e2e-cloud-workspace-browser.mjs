import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { browserOf } from './helpers/e2e-chat.mjs';
import {
  startWorkspaceFixture,
  WORKSPACE_BRAND,
} from './helpers/cloud-workspace-fixture.mjs';

const { engine, browserType } = await browserOf('cloud-workspace');
const app = await startWorkspaceFixture();
let browser;
const errors = [];
const artifacts = process.env.E2E_CLOUD_SCREENSHOTS;
const screenshot = (page, name) =>
  artifacts
    ? page.screenshot({ path: path.join(artifacts, `${name}.png`) })
    : null;

const signIn = async (page, key) => {
  await page.getByLabel('Workspace access key').fill(key);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

const writeLink = (page, link) =>
  page.evaluate(async (body) => {
    const res = await fetch('/links', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.status;
  }, link);

const linkId = (page) =>
  page.evaluate(async () => {
    const response = await fetch('/links/fixture:cross-browser');
    return (await response.json()).id;
  });

try {
  if (artifacts) {
    await mkdir(artifacts, { recursive: true });
  }
  browser = await browserType.launch({ headless: true });
  const options = {
    viewport: { width: 1200, height: 800 },
    locale: 'en-US',
    ignoreHTTPSErrors: true,
  };
  const first = await browser.newContext(options);
  const second = await browser.newContext(options);
  const page = await first.newPage();
  const secondPage = await second.newPage();
  for (const tab of [page, secondPage]) {
    tab.on('pageerror', (error) => errors.push(error.message));
  }
  const foreignRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== app.origin) {
      foreignRequests.push(request.url());
    }
  });

  await page.goto(`${app.origin}/?server=http://127.0.0.1:1`);
  assert.equal(new URL(page.url()).pathname, '/_cloud/sign-in');
  await page.getByRole('heading', { name: WORKSPACE_BRAND }).waitFor();
  await screenshot(page, 'sign-in');
  await signIn(page, 'invalid');
  await page.getByRole('alert').waitFor();
  await signIn(page, app.ownerKey);
  await page.getByRole('button', { name: 'Sign out' }).waitFor();
  assert.equal(await page.title(), WORKSPACE_BRAND);
  const [cookie] = (await first.cookies()).filter(
    ({ name }) => name === '__Host-ms-workspace'
  );
  assert.ok(cookie.secure && cookie.httpOnly);
  assert.equal(cookie.sameSite, 'Strict');

  assert.equal(
    await writeLink(page, { id: 'fixture:cross-browser', tokens: ['fixture'] }),
    200
  );
  await page.reload();
  assert.equal(await linkId(page), 'fixture:cross-browser');
  await secondPage.goto(app.origin);
  assert.equal(new URL(secondPage.url()).pathname, '/_cloud/sign-in');
  await signIn(secondPage, app.ownerKey);
  await secondPage.getByRole('button', { name: 'Sign out' }).waitFor();
  assert.equal(await linkId(secondPage), 'fixture:cross-browser');
  const persisted = await page.evaluate(async () =>
    typeof globalThis.indexedDB.databases === 'function'
      ? (await globalThis.indexedDB.databases()).map(({ name }) => name)
      : []
  );
  assert.deepEqual(persisted, []);

  await page.locator('button[data-view="operator"]').click();
  await page.locator('main[data-view="operator"]').waitFor();
  await page.locator('button[data-view="connections"]').click();
  await page.locator('article[data-provider-id="telegram"]').waitFor();
  assert.equal(
    await page.locator('[data-action="marketplace-open"]').count(),
    0
  );
  assert.equal(
    await page.getByText('Find sign-ins', { exact: true }).count(),
    0
  );
  await screenshot(page, 'connections');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Workspace access key').waitFor();
  assert.equal(
    await page.evaluate(async () => (await fetch('/links')).status),
    401
  );
  assert.equal(await linkId(secondPage), 'fixture:cross-browser');
  assert.deepEqual(foreignRequests, []);
  assert.deepEqual(errors, []);
  console.log(`[e2e-cloud-workspace] OK (${engine})`);
} finally {
  await browser?.close();
  await app.close();
}
