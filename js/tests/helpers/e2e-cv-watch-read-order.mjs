import assert from 'node:assert/strict';

/** A status response captured before Stop cannot reactivate the stopped UI. */
export const stopCvWatchWithLateRead = async (page, view) => {
  const pattern = '**/api/vacancies/cv-watch-status?*';
  let arrive;
  let release;
  let complete;
  let intercepted = false;
  let failure;
  const arrived = new Promise((resolve) => {
    arrive = resolve;
  });
  const released = new Promise((resolve) => {
    release = resolve;
  });
  const completed = new Promise((resolve) => {
    complete = resolve;
  });
  await page.route(pattern, async (route) => {
    if (intercepted) {
      return route.continue();
    }
    intercepted = true;
    const response = await route.fetch();
    arrive();
    await released;
    try {
      await route.fulfill({ response });
    } catch (error) {
      failure = error;
    } finally {
      complete();
    }
  });
  try {
    await arrived;
    const stopped = page.waitForResponse((response) =>
      response.url().endsWith('/api/vacancies/cv-watch-stop')
    );
    await view.locator('[data-cv-watch-action="stop"]').click();
    await stopped;
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          globalThis.requestAnimationFrame(() =>
            globalThis.requestAnimationFrame(resolve)
          );
        })
    );
    release();
    await completed;
    await page.waitForFunction(
      () => !document.querySelector('[data-cv-watch-action="reload"]').disabled
    );
    assert.equal(failure, undefined);
    assert.equal(
      await view.locator('[data-cv-watch-state="stopped"]').count(),
      1,
      'A delayed pre-Stop status must not restore active observation'
    );
    assert.equal(
      await view.locator('[data-cv-watch-action="stop"]').isDisabled(),
      true
    );
  } finally {
    release();
    await page.unroute(pattern);
  }
};
