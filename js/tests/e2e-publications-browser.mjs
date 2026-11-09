// The shared publication adapters and HTML formatter run without Node shims.
import { build } from 'esbuild';
import { browserOf, assert } from './helpers/e2e-chat.mjs';

const { browserType, engine } = await browserOf('publications');
const { outputFiles } = await build({
  stdin: {
    contents: `export { createVkLive } from './js/src/sources/vk.js';
export { createTelegramBotLive } from './js/src/sources/telegram.js';
export { telegramPostFormat } from './js/src/sources/telegram-post-format.js';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'iife',
  globalName: 'publicationFixture',
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
  await page.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Publication fixture</title>',
    })
  );
  await page.goto('http://127.0.0.1/issue-56-publication-fixture');
  await page.addScriptTag({ content: outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const { createVkLive, createTelegramBotLive, telegramPostFormat } =
      globalThis.publicationFixture;
    const calls = [];
    const fetchImpl = async (url, init) => {
      const method = new URL(url).pathname.split('/').at(-1);
      calls.push({
        method,
        body: method.startsWith('wall.')
          ? Object.fromEntries(init.body)
          : JSON.parse(init.body),
      });
      const response = method.startsWith('wall.')
        ? { response: method === 'wall.delete' ? 1 : { post_id: 71 } }
        : {
            ok: true,
            result:
              method === 'deleteMessage'
                ? true
                : { message_id: 72, chat: { id: -10042 } },
          };
      return new globalThis.Response(JSON.stringify(response));
    };
    const vk = createVkLive({
      token: 'example-vk-token',
      fetchImpl,
      limiter: { wait: async () => {} },
    });
    const vkPost = await vk.publishPost({
      ownerId: '-42',
      text: 'VK announcement',
      clientId: 'browser-draft',
    });
    const vkDeleted = await vk.deletePost(vkPost);
    const telegram = createTelegramBotLive({
      token: 'example-bot-token',
      fetchImpl,
    });
    const telegramPost = await telegram.publishPost({
      chat: '-10042',
      text: '<b>News</b>',
      format: 'html',
    });
    const telegramDeleted = await telegram.deletePost(telegramPost);
    const parsed = telegramPostFormat('😀 <b>A &amp; B</b>', 'html');
    const plain = telegramPostFormat('**literal**', 'plain');
    const uncertain = createTelegramBotLive({
      token: 'example-bot-token',
      fetchImpl: async () =>
        new globalThis.Response(JSON.stringify({ ok: true, result: {} })),
    });
    let outcome;
    try {
      await uncertain.publishPost({ chat: '-10042', text: 'Uncertain' });
    } catch (error) {
      outcome = {
        code: error.code,
        ambiguous: error.ambiguous,
        retry: error.safeToRetry,
      };
    }
    return {
      vkPost,
      vkDeleted,
      telegramPost,
      telegramDeleted,
      parsed,
      plain,
      calls,
      outcome,
    };
  });
  assert(
    result.vkPost.url === 'https://vk.com/wall-42_71' &&
      result.vkDeleted.deleted,
    'VK wall receipt lifecycle'
  );
  assert(
    result.telegramPost.messageId === '72' && result.telegramDeleted.deleted,
    'Telegram message receipt lifecycle'
  );
  assert(
    result.calls.length === 4 && result.calls[0].body.guid === 'browser-draft',
    'bounded requests and VK deduplication'
  );
  assert(result.calls[2].body.parse_mode === 'HTML', 'Bot HTML mode');
  assert(
    result.parsed.text === '😀 A & B' && result.parsed.entities[0].offset === 3,
    'HTML parsing and UTF-16 offsets'
  );
  assert(
    result.plain.text === '**literal**' && result.plain.entities.length === 0,
    'literal plaintext'
  );
  assert(
    result.outcome.code === 'send-unknown' &&
      result.outcome.ambiguous &&
      !result.outcome.retry,
    'uncertain receipt is not a success'
  );
  assert(errors.length === 0, `browser errors: ${errors.join('; ')}`);
  console.log(
    `[e2e-publications:${engine}] PASS: VK/Telegram lifecycle, HTML/plain formatting and uncertain receipts`
  );
} finally {
  await browser.close();
}
