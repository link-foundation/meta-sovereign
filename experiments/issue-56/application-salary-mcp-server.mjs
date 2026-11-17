import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { applicationNativeFixture } from './application-native-fixture.mjs';
import { seedApplicationAnswerContext } from './application-answer-context-fixture.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
});
let fixture;
let control;
const outcomes = [];
try {
  fixture = await applicationNativeFixture(browser, {
    salary: 'до 200000 ₽',
    onApplicationClose: (outcome) => outcomes.push(outcome),
  });
  await seedApplicationAnswerContext(fixture.store);
  await fixture.page.context().close();
  control = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        opens: fixture.records.length,
        closed: fixture.records.every((row) => row.closed),
        clicks: fixture.records.reduce((n, row) => n + (row.clicks ?? 0), 0),
        outcomes,
        errors: fixture.errors,
        liveProvider: false,
      })
    );
  });
  await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
  console.log(
    JSON.stringify({
      base: fixture.base,
      stats: `http://127.0.0.1:${control.address().port}`,
    })
  );
  process.stdin.resume();
  await new Promise((resolve) => process.stdin.once('data', resolve));
} finally {
  process.stdin.pause();
  if (control) {
    await new Promise((resolve) => control.close(resolve));
  }
  await fixture?.close();
  await browser.close();
  console.log(JSON.stringify({ resourcesClosed: true, liveProvider: false }));
}
