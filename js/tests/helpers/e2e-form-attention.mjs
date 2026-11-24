import { assert } from './e2e-chat.mjs';

const installAlertSpies = (permission) => {
  globalThis.localStorage.setItem(
    'metaSovereignNotifySound',
    permission === 'denied' ? 'on' : 'off'
  );
  globalThis.noticeCalls = [];
  globalThis.chimes = 0;
  globalThis.Notification = class {
    static permission = permission;

    constructor(title, options) {
      this.title = title;
      this.options = options;
      this.closed = false;
      globalThis.noticeCalls.push(this);
    }

    close() {
      this.closed = true;
    }
  };
  globalThis.Audio = class {
    play() {
      globalThis.chimes++;
      return Promise.resolve();
    }
  };
};

const openNotice = async (page, permission = 'denied') => {
  const notice = await page.context().newPage();
  await notice.addInitScript(installAlertSpies, permission);
  await notice.setViewportSize({ width: 390, height: 844 });
  await notice.clock.install({ time: new Date() });
  await notice.goto(new URL('/#/settings', page.url()).toString());
  return notice;
};

const enableNotice = (notice) =>
  notice.evaluate(() => {
    globalThis.Notification.permission = 'granted';
    globalThis.localStorage.setItem('metaSovereignNotifySound', 'off');
    globalThis.dispatchEvent(
      new globalThis.Event('meta-sovereign:form-attention')
    );
  });

const formWaitBanner = (notice) =>
  notice.locator('[data-form-attention="application-2"]');

export const verifyFormWaitNotice = async ({ page, owner }) => {
  const notice = await openNotice(page);
  const banner = formWaitBanner(notice);
  await banner.waitFor();
  assert(
    await banner
      .getByText('This review cannot bring a browser window forward.')
      .isVisible(),
    'headless wait remains visible without window focus'
  );
  assert(
    await notice.evaluate(
      () => globalThis.chimes === 1 && globalThis.noticeCalls.length === 0
    ),
    'in-app notice and independent sound survive denied system permission'
  );
  assert(
    await notice.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'mobile notice fits viewport'
  );
  if (process.env.FORMS_ATTENTION_SCREENSHOTS === '1') {
    await notice.screenshot({
      path: 'docs/screenshots/issue-56-forms-attention-mobile.png',
      animations: 'disabled',
    });
  }

  // Exercise the headed receipt path while running the actual browser headlessly in CI.
  owner.policy.headless = false;
  await enableNotice(notice);
  await banner.getByRole('button', { name: 'Show browser' }).waitFor();
  await notice.waitForFunction(() => globalThis.noticeCalls.length === 1);
  assert(
    await notice.evaluate(
      () =>
        globalThis.chimes === 1 &&
        globalThis.noticeCalls[0].options.silent &&
        !globalThis.noticeCalls[0].options.body.includes('application-2')
    ),
    'muted system notice carries generic text and no window name'
  );
  if (process.env.FORMS_ATTENTION_SCREENSHOTS === '1') {
    await notice.setViewportSize({ width: 1200, height: 800 });
    await notice.screenshot({
      path: 'docs/screenshots/issue-56-forms-attention-desktop.png',
      animations: 'disabled',
    });
    await notice.setViewportSize({ width: 390, height: 844 });
  }

  await notice.clock.fastForward(5 * 60_000);
  await notice.waitForFunction(
    () =>
      globalThis.noticeCalls.length === 2 && globalThis.noticeCalls[0].closed
  );
  const focused = notice.waitForResponse(
    (response) =>
      response.url().endsWith('/api/forms/sessions/focus') && response.ok()
  );
  const show = banner.getByRole('button', { name: 'Show browser' });
  await show.click();
  await focused;
  await notice.waitForFunction(() =>
    globalThis.document.querySelector(
      '[data-action="form-attention-focus"]:enabled'
    )
  );
  assert(
    owner.focuses === 1,
    'browser focus reaches the owned window exactly once'
  );
  await notice.clock.fastForward(5 * 60_000);
  assert(
    (await notice.evaluate(() => globalThis.noticeCalls.length)) === 2,
    'an acknowledged browser focus waits longer than an unanswered reminder'
  );
  assert(
    await show.isVisible(),
    'browser focus keeps the in-app status visible'
  );
  await notice.clock.fastForward(10 * 60_000);
  await notice.waitForFunction(
    () =>
      globalThis.noticeCalls.length === 3 && globalThis.noticeCalls[1].closed
  );
  const alertFocused = notice.waitForResponse(
    (response) =>
      response.url().endsWith('/api/forms/sessions/focus') && response.ok()
  );
  await notice.evaluate(() => globalThis.noticeCalls.at(-1).onclick());
  await alertFocused;
  await notice.waitForFunction(() =>
    globalThis.document.querySelector(
      '[data-action="form-attention-focus"]:enabled'
    )
  );
  assert(
    owner.focuses === 2,
    'system notice click targets the same active request'
  );
  await notice.clock.fastForward(5 * 60_000);
  assert(
    (await notice.evaluate(() => globalThis.noticeCalls.length)) === 3,
    'system notification focus defers the next external reminder'
  );
  await notice.close();
  return verifyLater(page);
};

const verifyLater = async (page) => {
  const notice = await openNotice(page, 'granted');
  const banner = formWaitBanner(notice);
  await banner.waitFor();
  await notice.waitForFunction(() => globalThis.noticeCalls.length === 1);
  await banner.getByRole('button', { name: 'Later' }).click();
  await banner.waitFor({ state: 'detached' });
  await notice.evaluate(() => {
    globalThis.location.hash = '#/forms';
  });
  await notice.locator('main[data-view="forms"]').waitFor();
  assert((await banner.count()) === 0, 'Later is preserved across navigation');
  await notice.clock.fastForward(14 * 60_000);
  assert((await banner.count()) === 0, 'Later does not repeat early');
  await notice.clock.fastForward(60_000);
  await banner.waitFor();
  await notice.waitForFunction(() => globalThis.noticeCalls.length === 2);
  return notice;
};
