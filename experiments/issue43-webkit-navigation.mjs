// Bounded owned-fixture contrast: handled fetches before/during document replacement.
// Run: node --test experiments/issue43-webkit-navigation.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { webkit } from 'playwright';
import { watchChatPages } from '../js/tests/helpers/e2e-page-errors.mjs';

test(
  'WebKit same-origin fetch during document replacement',
  { timeout: 30_000 },
  async (t) => {
    let release;
    let requested;
    const replacementRequested = new Promise((resolve) => {
      requested = resolve;
    });
    const server = createServer((request, response) => {
      if (request.url === '/replacement') {
        release = () => response.end('<title>replacement</title>');
        requested();
      } else if (request.url.startsWith('/api/')) {
        response.setHeader('content-type', 'application/json');
        response.end('{"ok":true}');
      } else {
        response.end('<title>original</title>');
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await webkit.launch();
    t.after(async () => {
      release?.();
      await browser.close();
    });
    const context = await browser.newContext();
    const collected = [];
    watchChatPages(context, { base, engine: 'webkit', errors: collected });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) =>
      errors.push({
        message: error.message,
        name: error.name,
        text: String(error),
      })
    );
    await page.goto(base);
    const handle = await page.evaluateHandle(() => globalThis);
    const fetchProbe = (world) =>
      world.fetch('/api/status?probe=1').then(
        (response) => ({ status: response.status }),
        (error) => ({ caught: error.message })
      );
    const control = await handle.evaluate(fetchProbe);
    assert.equal(control.status, 200);
    assert.deepEqual(errors, []);
    const navigation = page.goto(`${base}/replacement`);
    await replacementRequested;
    const duringReplacement = await handle.evaluate(fetchProbe);
    release();
    await navigation;
    console.log(
      JSON.stringify(
        { base, control, duringReplacement, errors, collected },
        null,
        2
      )
    );
    assert.ok(
      duringReplacement.caught,
      'the departing document handles its rejection'
    );
    assert.ok(
      errors.some((error) =>
        error.text.endsWith('due to access control checks.')
      )
    );
    assert.deepEqual(
      collected,
      [],
      'shared policy recognizes the engine diagnostic'
    );
  }
);
