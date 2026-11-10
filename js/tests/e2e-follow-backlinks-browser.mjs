// Production bundle, server and default Lino; only VK's external HTTP is faked.
import { followBacklinksFixture } from './helpers/follow-backlinks.mjs';
import { readWireResponse } from '../src/transport/lino.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const f = await followBacklinksFixture();
const { base, page, until, finish } = await openChatApp('follow-backlinks', {
  store: f.store,
  serverOptions: { follow: { backlinks: f.options } },
});
await page.addInitScript(() => {
  globalThis.localStorage.setItem(
    'metaSovereignTutorial',
    JSON.stringify({ off: true, v: 5 })
  );
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
});
const sends = () => f.calls.filter((c) => c.method === 'messages.send').length;
const receipts = [];
page.on('response', async (response) => {
  if (!response.url().includes('/follow/backlinks')) {
    return;
  }
  try {
    const value = await readWireResponse(
      new globalThis.Response(await response.body(), {
        headers: response.headers(),
      })
    );
    receipts.push({
      path: response.url().split('/backlinks')[1],
      status: response.status(),
      result: value.status ?? value.code ?? value.ok,
      rows: value.rows?.map((r) => ({
        status: r.status,
        code: r.code,
        cleanup: r.cleanup?.status,
      })),
    });
  } catch {
    // A failed response body is diagnosed by the UI and captured screenshot.
  }
});
await finish(async () => {
  try {
    await page.goto(`${base}/#/automation`);
    const card = page.locator('[data-follow-backlinks]');
    await card.locator('summary').click();
    const field = (key) =>
      card.locator(`[data-follow-backlink-field="${key}"]`);
    const action = (key) =>
      card.locator(`[data-follow-backlink-action="${key}"]`);
    const job = card.locator('[data-follow-backlink-job]');
    await field('chats').fill('2000000007');
    await field('backlink').fill('https://t.me/study_group');
    await field('monitorMs').fill('2000');
    await field('intervalMs').fill('1000');
    await field('deleteIncoming').check();
    await action('preview').click();
    await card.locator('[data-follow-backlink-plan]').waitFor();
    assert(sends() === 0, 'review does not post');
    await action('apply').evaluate((button) => {
      button.click();
      button.click();
    });
    await job
      .getByRole('heading', { name: 'Confirmed', exact: true })
      .waitFor();
    assert(sends() === 1, 'double click issues one post');
    assert(
      f.calls.filter((c) => c.method === 'messages.delete').length === 1,
      'one incoming-only cleanup'
    );
    assert(
      (await job.textContent()).includes('2 deletions confirmed'),
      'real deletion receipts rendered'
    );
    await action('list').click();
    await card.getByText('1 saved runs.', { exact: false }).waitFor();
    await action('preview').click();
    await action('apply').click();
    await job
      .getByRole('heading', { name: 'Confirmed', exact: true })
      .waitFor();
    assert(sends() === 1, 'saved receipt prevents repost');
    f.state.before = (call) => {
      if (call.method === 'messages.getById') {
        throw Object.assign(new Error('fixture'), { name: 'TimeoutError' });
      }
    };
    await field('backlink').fill('https://t.me/another_group');
    await action('preview').click();
    await action('apply').click();
    await job
      .getByRole('heading', {
        name: 'Paused; confirmed receipts are kept',
        exact: true,
      })
      .waitFor();
    const before = sends();
    f.state.before = undefined;
    await action('resume').click();
    await job
      .getByRole('heading', { name: 'Confirmed', exact: true })
      .waitFor();
    assert(sends() === before, 'resume monitors the existing post');
    await page.route('**/api/automations/follow/backlinks/status*', (route) =>
      fulfil(route, {})
    );
    await action('status').click();
    await card.getByRole('alert').waitFor();
    assert(
      (await job.textContent()).includes('2 deletions confirmed'),
      'read failure keeps confirmed receipt'
    );
    await page.unroute('**/api/automations/follow/backlinks/status*');
    await page.setViewportSize({ width: 390, height: 844 });
    await until(
      () =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
      'mobile backlink controls fit'
    );
  } catch (error) {
    console.error(
      JSON.stringify({ receipts, calls: f.calls.map((c) => c.method) })
    );
    throw error;
  } finally {
    await f.service.stop();
  }
});
