// Does Playwright's :nth-match() CSS extension survive the path the CV
// runner uses — page.locator() via browser-commander? (issue #29)
import { chromium } from 'playwright';

const html = `<!doctype html><html><body>
  <div class="card"><h1>first</h1></div>
  <div class="card"><h1>second</h1></div>
  <form><input name="q"></form><form><input name="q"></form>
</body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(html);
console.log('count .card =', await page.locator('.card').count());
console.log(
  'nth-match text =',
  await page.locator(':nth-match(.card h1, 1)').textContent()
);
await page.locator(':nth-match(form input[name="q"], 2)').fill('typed');
console.log(
  'nth-match fill =',
  await page.locator(':nth-match(form input[name="q"], 2)').inputValue()
);
try {
  await page.locator('.card').waitFor({ state: 'visible', timeout: 1000 });
  console.log('strict waitFor: no error');
} catch (error) {
  console.log('strict waitFor error name =', error.name);
  console.log('strict waitFor message =', error.message.split('\n')[0]);
}
await browser.close();
