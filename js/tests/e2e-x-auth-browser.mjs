// Universal source authentication runs in the browser without Node shims.
import { build } from 'esbuild';
import { browserOf, assert } from './helpers/e2e-chat.mjs';

const { browserType, engine } = await browserOf('x-auth');
const { outputFiles } = await build({
  stdin: {
    contents: `export { createXLive } from './js/src/sources/x.js';
export { xOAuthHeader } from './js/src/sources/x-oauth.js';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'iife',
  globalName: 'xAuthFixture',
  platform: 'browser',
  target: 'es2022',
  write: false,
  logLevel: 'silent',
});
const browser = await browserType.launch({
  headless: true,
  ...(process.env.E2E_EXECUTABLE_PATH
    ? { executablePath: process.env.E2E_EXECUTABLE_PATH }
    : {}),
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Loopback is a secure context for Web Crypto; every document is local.
  await page.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>X auth fixture</title>',
    })
  );
  await page.goto('http://127.0.0.1/issue-56-x-auth-fixture');
  await page.addScriptTag({ content: outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const { createXLive, xOAuthHeader } = globalThis.xAuthFixture;
    const vector = await xOAuthHeader({
      method: 'POST',
      url: 'http://example.com/request?b5=%3D%253D&a3=a&c%40=&a2=r%20b',
      form: 'c2&a3=2+q',
      apiKey: '9djdj82h48djs9d2',
      apiKeySecret: 'j49sk3j29djd',
      accessToken: 'kkk9d7dh3k39sjv7',
      accessTokenSecret: 'dh893hdasih9',
      nonce: '7d8f3e4a',
      timestamp: 137131201,
    });
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({
        method: init.method,
        authorization: init.headers.Authorization,
      });
      const response =
        init.method === 'DELETE'
          ? { data: { deleted: true } }
          : { data: { id: '123' } };
      return new globalThis.Response(JSON.stringify(response));
    };
    const live = createXLive({
      apiKey: 'example-api-key',
      apiKeySecret: 'example-api-secret',
      accessToken: 'example-user-token',
      accessTokenSecret: 'example-user-secret',
      fetchImpl,
    });
    const posted = await live.publishPost('Browser-only signing probe');
    const deleted = await live.deletePost(posted.data.id);
    let refused;
    try {
      await live.publishPost('Must not send', {
        authMode: 'app-only',
        bearerToken: 'app-token',
      });
    } catch (error) {
      refused = error.code;
    }
    return {
      vector,
      id: posted.data.id,
      deleted: deleted.data.deleted,
      calls,
      refused,
    };
  });
  assert(
    result.vector.includes(
      'oauth_signature="r6%2FTJjbCOr97%2F%2BUU0NsvSne7s5g%3D"'
    ),
    'corrected RFC signature'
  );
  assert(
    result.id === '123' && result.deleted === true,
    'positive publication and deletion receipts'
  );
  assert(result.calls.length === 2, 'app-only refusal makes no request');
  assert(
    result.calls.every((call) => call.authorization.startsWith('OAuth ')),
    'real browser HMAC authorization'
  );
  assert(result.refused === 'read-only-auth', 'read-only mode is explicit');
  assert(errors.length === 0, `browser errors: ${errors.join('; ')}`);
  console.log(
    `[e2e-x-auth:${engine}] PASS: Web Crypto RFC vector, signed lifecycle and app-only refusal`
  );
} finally {
  await browser.close();
}
