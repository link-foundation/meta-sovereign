import assert from 'node:assert/strict';
import { gate } from '../../../experiments/issue-56/vacancy-fixture.mjs';

/** Hold one real automatic status response across a native pointer press. */
export const restoreApplicationDuringStatusRead = async (
  controls,
  { before = false, screenshot = async () => {} } = {}
) => {
  const { page, action, panel } = controls;
  const held = gate();
  let intercepted = false;
  let restoreRequests = 0;
  const onRequest = (request) => {
    if (new URL(request.url()).pathname.endsWith('/application-restore')) {
      restoreRequests++;
    }
  };
  page.on('request', onRequest);
  const pattern = '**/api/vacancies/application-status?**';
  const holdStatus = async (route) => {
    if (intercepted) {
      return route.continue();
    }
    intercepted = true;
    const response = await route.fetch();
    await page.evaluate(() => {
      globalThis.applicationStatusResponseHeld = true;
    });
    await held.promise;
    await route.fulfill({ response });
  };
  await controls.confirm();
  const restore = action('restore');
  const bounds = await restore.boundingBox();
  assert(bounds);
  await restore.scrollIntoViewIfNeeded();
  const point = await restore.boundingBox();
  assert(point);
  await page.route(pattern, holdStatus);
  let pressed = false;
  try {
    await page.mouse.move(
      point.x + point.width / 2,
      point.y + point.height / 2
    );
    await page.mouse.down();
    pressed = true;
    await page.waitForFunction(
      () => globalThis.applicationStatusResponseHeld === true
    );
    const disabledDuringPress = await restore.isDisabled();
    await screenshot(before ? 'background-before' : 'background-after');
    assert.equal(disabledDuringPress, before);
    await page.mouse.up();
    pressed = false;
    held.resolve();
    if (before) {
      await page.waitForFunction(
        () =>
          !document.querySelector('[data-application-action="recover"]')
            .disabled
      );
      assert.equal(restoreRequests, 0);
      assert.equal(
        await panel.locator('[data-application-option="confirm"]').isChecked(),
        true
      );
    } else {
      await page.waitForFunction(
        () =>
          document.querySelector('[data-application-restoration]')?.dataset
            .applicationRestoration === 'restored' &&
          !document.querySelector('[data-application-option="confirm"]')
            .checked &&
          !document.querySelector('[data-application-action="recover"]')
            .disabled
      );
      assert.equal(restoreRequests, 1);
    }
    return {
      backgroundReadDuringPointerPress: true,
      disabledDuringPress,
      restoreRequests,
    };
  } finally {
    if (pressed) {
      await page.mouse.up();
    }
    held.resolve();
    await page.unroute(pattern, holdStatus);
    page.off('request', onRequest);
  }
};
