import { applicationDraftControl } from './application-draft-mcp-control.mjs';
import { applicationHoldControl } from './application-hold-mcp-control.mjs';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { choicePutFixture } from './choice-put-fixture.mjs';
import { applicationNativeFixture } from './application-native-fixture.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
});
let fixture;
try {
  const create =
    process.env.APPLICATION_REVIEW_FIXTURE === '1'
      ? applicationNativeFixture
      : process.env.CHOICE_PUT_FAILURE === '1'
        ? choicePutFixture
        : vacancyBrowserFixture;
  fixture = await create(browser);
  await fixture.page.context().close();
} catch (error) {
  await browser.close();
  throw error;
}
const stats = () => ({
  opens: fixture.records.length,
  closed: fixture.records.every((record) => record.closed),
  providerClicks: fixture.records.reduce(
    (sum, record) => sum + record.clicks,
    0
  ),
  pageErrors: fixture.errors,
  liveProvider: false,
  ...(fixture.failed ? { failedSaves: fixture.failed() } : {}),
});
const draftControl =
  process.env.APPLICATION_DRAFT_FIXTURE === '1'
    ? applicationDraftControl(browser)
    : null;
const holdControl =
  process.env.APPLICATION_HOLD_FIXTURE === '1'
    ? applicationHoldControl(browser)
    : null;
const control = createServer(async (req, res) => {
  try {
    const draft = (await draftControl?.(req)) ?? (await holdControl?.(req));
    if (draft) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(draft));
      return;
    }
  } catch (error) {
    res.statusCode = 500;
    res.end(error.message);
    return;
  }
  if (req.method === 'POST' && req.url === '/fail-next' && fixture.failNext) {
    fixture.failNext();
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(stats()));
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    pid: process.pid,
    base: fixture.base,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await new Promise((resolve) => control.close(resolve));
    await fixture.close();
    await browser.close();
    console.log(JSON.stringify(stats()));
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
