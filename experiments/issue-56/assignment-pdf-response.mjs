/** Inspect tiny owned PDF response bodies without an account or an external site. */
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { readAssignmentPdfBytes } from '../../js/src/assignments/source-pdf-bytes.js';

const engine = process.argv.includes('--webkit') ? webkit : chromium;
const browser = await engine.launch({
  headless: true,
  executablePath: process.env.E2E_EXECUTABLE_PATH,
});
const pdf = Buffer.from('%PDF-1.4\n% response-body fixture\n%%EOF\n');
const ownerRequests = [];
const server = createServer((request, response) => {
  const path = request.url;
  ownerRequests.push({
    path,
    referrer: request.headers.referer,
    signedIn: request.headers.cookie === 'owner=fixture',
  });
  if (path === '/redirect') {
    response.writeHead(302, { location: '/inline' }).end();
    return;
  }
  if (path === '/private' && request.headers.cookie !== 'owner=fixture') {
    response.writeHead(200, { 'content-type': 'text/html' }).end('Sign in');
    return;
  }
  if (path === '/partial') {
    response
      .writeHead(206, {
        'content-type': 'application/pdf',
        'content-range': `bytes 0-${pdf.length - 1}/${pdf.length + 100}`,
      })
      .end(pdf);
    return;
  }
  if (path === '/oversized' || path === '/chunked') {
    const chunk = Buffer.alloc(65536, 32);
    response.writeHead(200, {
      'content-type': 'application/pdf',
      ...(path === '/oversized' ? { 'content-length': 33 * chunk.length } : {}),
    });
    for (let index = 0; index < 33; index++) {
      response.write(chunk);
    }
    response.end();
    return;
  }
  const disposition = path === '/attachment' ? 'attachment' : 'inline';
  response
    .writeHead(200, {
      'content-type': 'application/pdf',
      'content-disposition': `${disposition}; filename="assignment.pdf"`,
      'content-length': pdf.length,
    })
    .end(pdf);
});
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/inline', '/redirect', '/attachment']) {
    const page = await browser.newPage();
    const navigation = [];
    const downloads = [];
    page.on('response', (response) => {
      if (response.request().isNavigationRequest()) {
        navigation.push(response);
      }
    });
    page.on('download', (file) =>
      downloads.push({
        url: file.url(),
        filename: file.suggestedFilename(),
        cancelled: file.cancel().catch(() => {}),
      })
    );
    let loaded = false;
    let error;
    try {
      const response = await page.goto(base + path, {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      });
      loaded = response?.ok() === true;
    } catch (failure) {
      error = failure.message.split('\n')[0];
      if (!downloads.length) {
        await page.waitForEvent('download', { timeout: 1000 }).catch(() => {});
      }
    }
    const captured = navigation.at(-1);
    const deadline = setTimeout(() => page.close().catch(() => {}), 5000);
    const bytes = await captured?.body().catch(() => null);
    clearTimeout(deadline);
    const observed = captured?.url() ?? downloads.at(-1)?.url;
    console.log(
      JSON.stringify({
        engine: engine.name(),
        path,
        observedPath: observed ? new URL(observed).pathname : null,
        status: captured?.status(),
        advertisedBytes: captured?.headers()['content-length'],
        exactBytes: bytes?.equals(pdf) === true,
        loaded,
        error,
        downloads: downloads.map(({ url, filename }) => ({
          filename,
          path: new URL(url).pathname,
        })),
      })
    );
    await Promise.all(downloads.map(({ cancelled }) => cancelled));
    await page.close();
  }
  ownerRequests.length = 0;
  const context = await browser.newContext();
  const page = await context.newPage();
  const read = (path) =>
    readAssignmentPdfBytes({ page }, base + path, () => {});
  assert.equal(await read('/private'), null);
  await page
    .context()
    .addCookies([{ name: 'owner', value: 'fixture', url: base }]);
  assert.deepEqual(Buffer.from(await read('/private')), pdf);
  assert.deepEqual(Buffer.from(await read('/attachment')), pdf);
  for (const path of ['/partial', '/oversized', '/chunked']) {
    assert.equal(await read(path), null);
  }
  await assert.rejects(read('/redirect'));
  assert.deepEqual(ownerRequests, [
    { path: '/private', referrer: undefined, signedIn: false },
    ...[
      '/private',
      '/attachment',
      '/partial',
      '/oversized',
      '/chunked',
      '/redirect',
    ].map((path) => ({ path, referrer: undefined, signedIn: true })),
  ]);
  assert.deepEqual(page.context().pages(), [page]);
  console.log(
    JSON.stringify({
      engine: engine.name(),
      exactAuthenticatedBytes: true,
      rejectedInvalidResponses: 5,
      secondNavigationFollowed: false,
      pagesClosed: true,
    })
  );
  await context.close();
} finally {
  try {
    await browser.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log(JSON.stringify({ resourcesClosed: true }));
  }
}
