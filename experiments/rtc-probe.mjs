import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import { chromium } from 'playwright';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-rtc-probe-'));
const h = await startServer({ port: 0, storeDir: dir });
const base = `http://127.0.0.1:${h.port}`;
console.log('base', base);

const browser = await chromium.launch({ headless: true });

const newPage = async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      console.log('  [console.error]', m.text());
    }
  });
  return { ctx, page };
};

const a = await newPage();
const b = await newPage();
await a.page.goto(base, { waitUntil: 'load' });
await b.page.goto(base, { waitUntil: 'load' });

// give SPA a moment to boot via app.js
await new Promise((r) => setTimeout(r, 1000));

const seed = async (page, label) => {
  const out = await page.evaluate(async () => {
    try {
      const mod = await import('/dom.js');
      window.__msApi = mod.api;
      const s = await mod.api.status();
      return { ok: true, status: s };
    } catch (e) {
      return { ok: false, err: String(e), stack: e.stack };
    }
  });
  console.log(label, JSON.stringify(out).slice(0, 300));
};
await seed(a.page, 'A');
await seed(b.page, 'B');

const probeId = `msg:rtc-probe-${Date.now()}`;
const putRes = await a.page.evaluate(async (id) => {
  try {
    const r = await window.__msApi.put({ id, tokens: ['rtc'], body: 'x' });
    return { ok: true, r };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
}, probeId);
console.log('put result', JSON.stringify(putRes).slice(0, 200));

const start = Date.now();
let found = false;
while (Date.now() - start < 20000) {
  const got = await b.page.evaluate(async (id) => {
    try {
      return await window.__msApi.get(id);
    } catch (e) {
      return { err: String(e) };
    }
  }, probeId);
  if (got && got.id === probeId) {
    found = true;
    console.log('FOUND in', Date.now() - start, 'ms');
    break;
  }
  await new Promise((r) => setTimeout(r, 250));
}
if (!found) {
  console.log('NOT FOUND after 20s');
}

await browser.close();
await h.close();
