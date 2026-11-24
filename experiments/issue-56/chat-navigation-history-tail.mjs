import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        new URL(route.request().url()).pathname === '/owner'
          ? '<iframe src="https://hh.ru/chat/7"></iframe>'
          : '<p>Bounded navigation history probe</p>',
    })
  );
  await page.goto('https://hh.ru/owner');
  const session = await page.context().newCDPSession(page);
  const frame = page.frames().find((item) => item !== page.mainFrame());
  for (const [name, change] of [
    ['initial', async () => {}],
    [
      'child-push',
      () => frame.evaluate(() => window.history.pushState({}, '', '/chat/8')),
    ],
    [
      'child-back',
      async () => {
        await frame.evaluate(() => window.history.back());
        await frame.waitForURL('**/chat/7');
      },
    ],
  ]) {
    await change();
    const history = await session.send('Page.getNavigationHistory');
    console.log(
      JSON.stringify({
        name,
        index: history.currentIndex,
        entries: history.entries.map((item) => ({
          id: item.id,
          url: item.url,
        })),
        length: await page.evaluate(() => window.history.length),
      })
    );
  }
  await session.detach();
  await page.close();
} finally {
  await browser.close();
}
