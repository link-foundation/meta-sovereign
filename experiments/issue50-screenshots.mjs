// Capture the actual download page before/after its Node runtime instructions.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { launchBrowser } from 'browser-commander';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dev/log/issues/50/pulls/51/local');
await mkdir(output, { recursive: true });
let before = true;
const oldCopy = execFileSync(
  'git',
  ['show', 'origin/main:js/src/web/download/copy.js'],
  { cwd: root }
);
const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};
const server = http.createServer(async (req, res) => {
  try {
    const rel =
      new URL(req.url, 'http://fixture').pathname.slice(1) || 'index.html';
    assert(!rel.includes('..'));
    const body =
      rel === 'copy.js' && before
        ? oldCopy
        : await readFile(path.join(root, 'js/src/web/download', rel));
    res.writeHead(200, {
      'content-type': mime[path.extname(rel)] || 'application/octet-stream',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const profile = await mkdtemp(path.join(os.tmpdir(), 'issue50-browser-'));
let session;
try {
  session = await launchBrowser({
    engine: 'playwright',
    headless: true,
    channel: 'chrome',
    userDataDir: profile,
  });
  const page = session.page;
  await page.setViewportSize({ width: 1100, height: 850 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://**/*', (route) => route.abort());
  for (const state of ['before', 'after']) {
    before = state === 'before';
    await page.goto(`http://127.0.0.1:${server.address().port}/?lang=en`);
    const expected = before ? /Node\.js 20 or newer/ : /Node\.js 26\.12\.1/;
    const text = page.getByText(expected).first();
    await text.waitFor();
    await text.scrollIntoViewIfNeeded();
    assert.match(await page.locator('body').innerText(), expected);
    await page.screenshot({ path: path.join(output, `node-${state}.png`) });
    console.log(`${state}: ${await text.innerText()}`);
  }
  assert.deepEqual(errors, []);
} finally {
  await session?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
