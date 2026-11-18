import assert from 'node:assert/strict';

/** A completed Start with a corrupt acknowledgement must recover only by GET. */
export const recoverCvWatchStart = async (page, view) => {
  const action = (name) => view.locator(`[data-cv-watch-action="${name}"]`);
  let posts = 0;
  await page.route('**/api/vacancies/cv-watch', async (route) => {
    posts++;
    await route.fetch();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"watch":null}',
    });
  });
  try {
    await action('start').click();
    await page.locator('[data-vacancy-error]').waitFor();
    assert.equal(await action('start').isDisabled(), true);
  } finally {
    await page.unroute('**/api/vacancies/cv-watch');
  }
  await action('reload').click();
  await view.locator('[data-cv-watch-state="watching"]').waitFor();
  assert.equal(posts, 1);
};
