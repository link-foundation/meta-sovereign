// PR #34 review: on a phone, scroll each view to the bottom and check
// the last control clears the fixed bottom navigation; also log every
// failed request (the audit saw an unexplained 404).
/* global localStorage, scrollTo */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4799/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on(
  'response',
  (r) => r.status() >= 400 && console.log('HTTP', r.status(), r.url())
);
await page.addInitScript(() =>
  localStorage.setItem(
    'metaSovereignTutorial',
    JSON.stringify({ off: true, completed: true, at: 0 })
  )
);
await page.goto(url, { waitUntil: 'networkidle' });
for (const view of (process.argv[3] ?? 'automation').split(',')) {
  const nav = page.locator(`[data-view="${view}"].nav-item`).first();
  if (!(await nav.isVisible())) {
    await page.click('[data-action="nav-more"]');
  }
  await nav.click();
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    scrollTo(0, document.documentElement.scrollHeight);
    const navTop = document
      .querySelector('.bottom-nav')
      .getBoundingClientRect().top;
    const ctrls = [
      ...document.querySelectorAll(
        'main button, main input, main select, main textarea'
      ),
    ];
    const last = ctrls
      .map((c) => c.getBoundingClientRect().bottom)
      .reduce((a, b) => Math.max(a, b), 0);
    return { navTop, last };
  });
  console.log(view, r, r.last <= r.navTop ? 'OK' : 'HIDDEN');
}
await browser.close();
