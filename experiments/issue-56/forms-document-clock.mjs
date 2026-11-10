// Finite native-clock probe: one local page, one reload, 128 reads per frame.
import { webkit } from 'playwright';
import { startFormsFixture } from './forms-reader-fixture.mjs';

const fixture = await startFormsFixture();
let browser;
try {
  browser = await webkit.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(fixture.url.replace('/application', '/prefill'));
  for (const frame of page.frames()) {
    const samples = [];
    for (let index = 0; index < 128; index++) {
      samples.push(
        await frame.evaluate(() => globalThis.performance.timeOrigin)
      );
    }
    console.log(
      JSON.stringify({
        url: frame.url(),
        reads: samples.length,
        values: [...new Set(samples)],
      })
    );
  }
  await page.reload();
  console.log(
    JSON.stringify({
      reload: await page.evaluate(() => globalThis.performance.timeOrigin),
    })
  );
} finally {
  await browser?.close();
  await fixture.close();
}
