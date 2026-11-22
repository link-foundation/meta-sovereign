// Run with RUN_BROWSER_E2E=1 and CADDY_BIN set to a local Caddy executable.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { startServer } from '../js/src/server/index.js';
import { browserOf } from '../js/tests/helpers/e2e-chat.mjs';

const { browserType } = await browserOf('cloud-workspace-caddy');
const key = () => randomBytes(32).toString('hex');
const listen = createServer().listen(0, '127.0.0.1');
await once(listen, 'listening');
const { port } = listen.address();
listen.close();
await once(listen, 'close');
const host = `127.0.0.1:${port}`;
const origin = `https://${host}`;
const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-cloud-caddy-'));
const ownerKey = key();
const storeKey = key();
let server;
let proxy;
let browser;

try {
  server = await startServer({
    port: 0,
    tls: false,
    cloud: {
      origin,
      host,
      ownerKey,
      storeKey,
      brand: { name: 'Caddy fixture', accent: null, logo: null },
    },
    storeDir: path.join(dir, 'store'),
    secretPassphrase: storeKey,
    telegramAccount: false,
    emailPoll: false,
    enableHandlers: false,
    backups: { enabled: false },
    automations: { scheduler: false },
    log: null,
  });
  const config = path.join(dir, 'Caddyfile');
  await writeFile(
    config,
    `{
  admin off
  skip_install_trust
  auto_https disable_redirects
}
${origin} {
  bind 127.0.0.1
  tls internal
  reverse_proxy 127.0.0.1:${server.port}
}
`
  );
  proxy = spawn(process.env.CADDY_BIN || 'caddy', ['run', '--config', config], {
    env: { ...process.env, XDG_CONFIG_HOME: dir, XDG_DATA_HOME: dir },
    stdio: 'inherit',
  });
  const exited = once(proxy, 'exit').then(([code]) => {
    throw new Error(`Caddy exited with status ${code}`);
  });
  await Promise.race([exited, once(proxy, 'spawn')]);
  browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await page.goto(origin, { timeout: 3000 });
      break;
    } catch (error) {
      if (attempt === 9) {
        throw error;
      }
      await setTimeout(200);
    }
  }
  await page.getByLabel('Workspace access key').fill(ownerKey);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('button[data-view="contacts"]').click();
  const directory = page.locator('main[data-view="contacts"]');
  await directory
    .locator('[data-action="contacts-import-vcard"]:enabled')
    .waitFor();
  await directory.locator('[data-field="contacts-vcard"]').setInputFiles({
    name: 'fixture.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(
      'BEGIN:VCARD\nVERSION:3.0\nUID:fixture-caddy\nFN:Fixture Contact\nEMAIL:contact@example.test\nEND:VCARD'
    ),
  });
  const preview = directory.locator('[data-contacts-preview]');
  await preview.getByText(/Fixture Contact/).waitFor();
  const [applied] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/contacts/import/apply'
    ),
    preview.locator('[data-action="contacts-import-apply"]').click(),
  ]);
  assert.equal(applied.status(), 200);
  const contact = directory
    .locator('tbody')
    .getByText('Fixture Contact', { exact: true });
  await contact.waitFor();
  await page.reload();
  await contact.waitFor();
  console.log('[cloud-workspace-caddy] vCard import persisted across reload');
} finally {
  await browser?.close();
  if (proxy?.pid && proxy.exitCode === null && proxy.signalCode === null) {
    const stopped = once(proxy, 'exit');
    proxy.kill();
    await stopped;
  }
  await server?.close();
  await rm(dir, { recursive: true, force: true });
}
