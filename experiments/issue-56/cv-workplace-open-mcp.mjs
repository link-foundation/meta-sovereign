// prettier-ignore
async (page) => {
  const base = new URL(page.url()).origin;
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem('metaSovereignTutorial', '{"off":true,"v":5}');
  });
  let posts = 0;
  page.on('request', (request) => {
    posts += Number(request.method() === 'POST' && request.url().endsWith('/cv-prepare'));
  });
  await page.goto(`${base}/#/cv`);
  const panel = page.locator('[data-cv-preparation]');
  await panel.locator('[data-cv-prepare-record="en:jobs.0.description"]').fill('123');
  await panel.locator('[data-cv-prepare-change="en:jobs.0.description"]').click();
  await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
  await panel.scrollIntoViewIfNeeded();
  const text = await panel.textContent();
  if (!text.includes('complete workplace list') || !text.includes('does not confirm a provider save')) {
    throw new Error('Native opening and draft-only outcome must remain explicit');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
  await panel.scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > globalThis.innerWidth);
  if (overflow || posts !== 1) {
    throw new Error('Phone recovery must not overflow or replay preparation');
  }
  await page.screenshot({ path: 'docs/screenshots/issue-56-cv-workplace-open/cv-workplace-open-mcp-phone.png' });
  return { prepared: true, posts, overflow, reloaded: true, providerSaved: false };
}
