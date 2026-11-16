// prettier-ignore
async (page) => {
  const review = page.locator('[data-review-action="history"]');
  if (!(await review.count())) {
    const form = await page.locator('[data-form-url]').inputValue();
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLanguage', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        '{"off":true,"v":5}'
      );
    });
    await page.reload();
    await page.locator('[data-form-url]').fill(form);
    await page.locator('[data-form-slot]').fill('application-2');
    await page.locator('[data-action="open-form-review"]').click();
    await review.waitFor();
    await page.locator('[data-review-action="read"]').click();
    await page.locator('[data-action="plan-form"]').click();
    await page.locator('[data-form-plan-summary]').waitFor();
    return { phase: 'planned', ownerSubmissionRequired: true };
  }
  await review.click();
  await page
    .getByText(/3 proposals saved/)
    .first()
    .waitFor();
  const journal = await page.locator('[data-form-journal]').innerText();
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > globalThis.innerWidth
  );
  await page.locator('[data-review-action="close"]').click();
  await review.waitFor({ state: 'detached' });
  await page.reload();
  await page.locator('[data-form-slot]').waitFor();
  return {
    phase: 'learned',
    journal,
    overflow,
    closed: !(await review.count()),
    reloaded: true,
  };
}
