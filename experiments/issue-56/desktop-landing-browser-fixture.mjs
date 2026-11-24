import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fixtureServerClose } from '../../js/tests/helpers/fixture-server.mjs';
import { partialLandingRelease } from './desktop-landing-fixture.mjs';

/** Serve only the static download surface; never start the user's app server. */
export const desktopLandingFixture = async () => {
  const source = new URL('../../js/src/web/download/', import.meta.url);
  const allowed = new Set([
    'index.html',
    'page.js',
    'downloads.js',
    'model.js',
    'copy.js',
    'verify.js',
    'download.css',
  ]);
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://fixture').pathname;
    if (pathname === '/fixture.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify([partialLandingRelease()]));
      return;
    }
    const name =
      pathname === '/download/'
        ? 'index.html'
        : pathname.slice('/download/'.length);
    const file =
      pathname === '/download/icon.svg'
        ? new URL('../../desktop/icon.svg', import.meta.url)
        : pathname.startsWith('/download/') && allowed.has(name)
          ? new URL(name, source)
          : null;
    const bytes = file ? await readFile(file) : null;
    const mime = name.endsWith('.js')
      ? 'text/javascript'
      : name.endsWith('.css')
        ? 'text/css'
        : name.endsWith('.svg')
          ? 'image/svg+xml'
          : 'text/html';
    response.writeHead(bytes ? 200 : 404, { 'content-type': mime });
    response.end(bytes ?? 'not found');
  });
  const close = fixtureServerClose(server, 'desktop-landing');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close };
};
