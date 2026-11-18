import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { gate } from '../../../experiments/issue-56/vacancy-fixture.mjs';

/** Let already-greeted contacts load while a real chat row is pressed. */
export const verifyBirthdayReloadSelection = async (
  page,
  { before = false, replyContacts } = {}
) => {
  const contacts = gate();
  const history = gate();
  const contactPattern = '**/api/telegram/contact-birthdays';
  const historyPattern = '**/api/chat/messages?**';
  const contactRoute = async (route) => {
    await contacts.promise;
    await replyContacts(route);
  };
  const historyRoute = async (route) => {
    const url = new URL(route.request().url());
    if (
      url.searchParams.get('key') !== 'telegram:45' ||
      url.searchParams.get('limit') !== '200'
    ) {
      return route.fallback();
    }
    const response = await route.fetch();
    await page.evaluate(() => {
      globalThis.birthdayHistoryHeld = true;
    });
    await history.promise;
    await route.fulfill({ response });
  };
  await page.route(contactPattern, contactRoute);
  await page.route(historyPattern, historyRoute);
  let pressed = false;
  try {
    await page.reload();
    const row = page.locator('[data-chat="telegram:42"]');
    await row.waitFor();
    await row.scrollIntoViewIfNeeded();
    const bounds = await row.boundingBox();
    assert(bounds);
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
    await page.mouse.down();
    pressed = true;
    contacts.resolve();
    await page.waitForFunction(
      () => globalThis.birthdayHistoryHeld === true,
      null,
      { timeout: 10000 }
    );
    if (before) {
      await page.locator('.birthdays-block').waitFor();
    } else {
      await page
        .locator('[data-birthdays-state="loading"]')
        .waitFor({ state: 'attached', timeout: 10000 });
      assert.equal(await page.locator('.birthdays-block').count(), 0);
      assert.equal((await row.boundingBox()).y, bounds.y);
    }
    const movedDuringPress = (await row.boundingBox()).y !== bounds.y;
    assert.equal(movedDuringPress, before);
    const directory = process.env.E2E_ARTIFACT_DIR;
    if (directory) {
      await mkdir(directory, { recursive: true });
      await page.screenshot({
        path: join(
          directory,
          `birthday-selection-${before ? 'before' : 'after'}.png`
        ),
      });
    }
    await page.mouse.up();
    pressed = false;
    history.resolve();
    const expected = before ? '43' : '42';
    await page
      .locator(`[data-chat="telegram:${expected}"][aria-current="true"]`)
      .waitFor({ timeout: 10000 });
    if (!before) {
      await page
        .locator('[data-birthdays-state="ready"]')
        .waitFor({ state: 'attached', timeout: 10000 });
    }
    await page.waitForFunction(
      () => !document.querySelector('.birthdays-block')
    );
    console.log(
      '[birthday-selection-receipt]',
      JSON.stringify({
        heldHistoryDuringPress: true,
        transientReminder: before,
        rowMoved: movedDuringPress,
        selected: expected,
        deadlineChanged: false,
      })
    );
  } finally {
    if (pressed) {
      await page.mouse.up();
    }
    contacts.resolve();
    history.resolve();
    await page.unroute(contactPattern, contactRoute);
    await page.unroute(historyPattern, historyRoute);
  }
};
