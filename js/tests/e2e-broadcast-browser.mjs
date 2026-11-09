// Actual confirmed API and production UI; fake providers never publish anything.
import { createMemoryStore } from '../src/storage/universal.js';
import { getSource } from '../src/sources/index.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { requestBody } from './helpers/http-wire.mjs';

const store = createMemoryStore();
const calls = [];
const sources = ['x', 'vk'].map((name) => getSource(name));
const originals = sources.map((source) => source.live.post);
let uncertain = false;
let release;
sources[0].live.post = async (content) => {
  calls.push({ network: 'x', body: content.body });
  return { id: 'fixture-post' };
};
sources[1].live.post = async (content) => {
  calls.push({ network: 'vk', body: content.body });
  if (uncertain) {
    await new Promise((resolve) => {
      release = resolve;
    });
    throw Object.assign(new Error('Fixture response lost'), {
      ambiguous: true,
    });
  }
  return { ok: false, error: 'Fixture permission denied' };
};
const { page, base, until, finish } = await openChatApp('broadcast', { store });
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  globalThis.localStorage.setItem(
    'metaSovereignTutorial',
    JSON.stringify({ v: 5, off: true })
  );
});
const statuses = [];
const warnings = [];
page.on('console', (message) => {
  if (message.type() === 'warning') {
    warnings.push(message.text());
  }
});
page.on('response', (response) => {
  if (new URL(response.url()).pathname === '/api/broadcast') {
    statuses.push(response.status());
  }
});
const result = page.locator('[data-broadcast-result]');
const text = page.getByRole('textbox', {
  name: 'Message for every selected network',
});
const send = page.getByRole('button', { name: 'Send', exact: true });
const select = async (networks) => {
  for (const input of await page.locator('.source-checks input').all()) {
    await input.setChecked(networks.includes(await input.inputValue()));
  }
};
const outcome = async (expected) =>
  until(async () => (await result.textContent())?.includes(expected), expected);

await finish(async () => {
  try {
    await page.goto(`${base}/#broadcast`);
    await page.locator('.source-checks input[value="x"]:checked').waitFor();
    assert(await send.isDisabled(), 'empty message cannot send');
    await select(['vk']);
    await text.fill('Failed attempt');
    assert(calls.length === 0, 'editing does not publish');
    await send.click();
    await outcome('0 sent · 1 not sent · 0 uncertain · 0 queued');
    assert(
      (await result.textContent()).includes('Fixture permission denied'),
      'provider failure remains visible'
    );
    assert(
      (await text.inputValue()) === 'Failed attempt',
      'failure preserves the draft'
    );
    assert(
      (await store.query((link) => link.id.startsWith('broadcast:')))[0]
        .status === 'failed',
      'stored failure matches the UI'
    );

    await select(['x', 'vk']);
    await text.fill('Partial attempt');
    await send.click();
    await outcome('1 sent · 1 not sent · 0 uncertain · 0 queued');
    assert(
      (await result.locator('li').count()) === 2,
      'each destination has its own result'
    );
    assert(
      (await result.textContent()).includes('X (Twitter): Sent.'),
      'destination name and success are rendered'
    );

    await select(['vk']);
    await text.fill('Uncertain attempt');
    uncertain = true;
    await send.click();
    await until(() => Boolean(release), 'pending provider call');
    assert(
      await page
        .getByRole('button', { name: 'Sending…', exact: true })
        .isDisabled(),
      'pending send prevents duplicate clicks'
    );
    await text.fill('Draft edited while sending');
    release();
    await outcome('0 sent · 0 not sent · 1 uncertain · 0 queued');
    assert(
      (await result.textContent()).includes(
        'Check the destination before retrying'
      ),
      'uncertain result explains recovery'
    );
    assert(
      (await result.locator('blockquote').textContent()) ===
        'Uncertain attempt',
      'result preserves the attempted message'
    );
    assert(
      (await text.inputValue()) === 'Draft edited while sending',
      'pending edits remain in the draft'
    );
    assert(calls.length === 4, 'uncertain delivery was attempted once');
    assert(
      statuses.filter((status) => status === 428).length === 3,
      'every send has a bound confirmation'
    );
    assert(
      !warnings.some((line) => line.includes('failed (428)')),
      'confirmation is not a failure warning'
    );

    await text.fill('Interrupted send');
    let interrupted = 0;
    await page.route('**/api/broadcast', (route) => {
      if (requestBody(route.request()).confirmToken) {
        interrupted++;
        return route.abort('failed');
      }
      return route.continue();
    });
    await send.click();
    await outcome('0 sent · 0 not sent · 1 uncertain · 0 queued');
    assert(
      interrupted === 1,
      'interrupted write is never automatically retried'
    );
    assert(
      (await result.locator('blockquote').textContent()) === 'Interrupted send',
      'network loss retains the attempted message'
    );
    await page.unroute('**/api/broadcast');

    await page.route('**/api/broadcast', (route) =>
      fulfil(route, { error: 'unknown route' }, 404)
    );
    await send.click();
    await outcome('Connect a supported server to send. Nothing was queued.');
    assert(calls.length === 4, 'unavailable server never publishes');
    assert(
      (await store.query((link) => link.id.startsWith('broadcast:'))).length ===
        3,
      'unavailable server creates no fake queue entry'
    );
  } finally {
    release?.();
    sources.forEach((source, index) => {
      source.live.post = originals[index];
    });
  }
});
