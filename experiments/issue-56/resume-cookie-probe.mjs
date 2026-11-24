import { webkit } from 'playwright';

const browser = await webkit.launch({ headless: true });
try {
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: 'fixture_session',
      value: 'owner-only',
      domain: 'hh.ru',
      path: '/',
      secure: true,
    },
  ]);
  const requests = [];
  await context.route('https://hh.ru/**', async (route) => {
    requests.push({
      url: route.request().url(),
      headers: await route.request().allHeaders(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html>Fixture',
    });
  });
  const page = await context.newPage();
  await page.goto('https://hh.ru/resume/english');
  console.log(
    JSON.stringify({
      cookies: await context.cookies(),
      documentCookie: await page.evaluate(() => globalThis.document.cookie),
    })
  );
  await page.evaluate(() =>
    fetch('/resume_converter/resume.pdf', { credentials: 'include' })
  );
  console.log(JSON.stringify(requests));
  await context.close();
} finally {
  await browser.close();
}
