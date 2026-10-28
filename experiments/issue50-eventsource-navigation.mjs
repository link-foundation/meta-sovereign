// Bounded, app-free contrast: EventSource while a replacement document waits.
import assert from 'node:assert/strict';
import http from 'node:http';
import { webkit } from 'playwright';

const replacement = Promise.withResolvers();
let release = () => {};
let requests = 0;
const server = http.createServer((request, response) => {
  if (request.url === '/events') {
    requests++;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(': ready\n\n');
  } else if (request.url === '/replacement') {
    release = () => response.end('<title>Replacement</title>');
    replacement.resolve();
  } else {
    response.end('<title>Initial</title>');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await webkit.launch();
const page = await browser.newPage();
const diagnostics = [];
page.on('pageerror', (error) =>
  diagnostics.push({ name: error.name, message: error.message })
);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const handle = await page.evaluateHandle(() => {
    const errors = [];
    globalThis.addEventListener('error', (event) => errors.push(event.message));
    globalThis.addEventListener('unhandledrejection', () =>
      errors.push('unhandled rejection')
    );
    return {
      errors,
      open: () =>
        new Promise((resolve) => {
          const source = new globalThis.EventSource('/events');
          const done = (event) => {
            source.close();
            resolve({ event: event.type, errors: [...errors] });
          };
          source.addEventListener('open', done, { once: true });
          source.addEventListener('error', done, { once: true });
        }),
    };
  });
  const control = await handle.evaluate((probe) => probe.open());
  assert.equal(control.event, 'open');
  assert.equal(requests, 1);
  assert.equal(diagnostics.length, 0);
  const navigating = page.goto(
    `http://127.0.0.1:${server.address().port}/replacement`
  );
  await replacement.promise;
  const departed = await handle.evaluate((probe) => probe.open());
  release();
  await navigating;
  console.log(JSON.stringify({ control, departed, requests, diagnostics }));
  assert.equal(departed.event, 'error');
  assert.deepEqual(departed.errors, []);
  assert.equal(requests, 1, 'cancelled EventSource never reaches the server');
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].name, /^EventSource cannot load http$/);
} finally {
  release();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
