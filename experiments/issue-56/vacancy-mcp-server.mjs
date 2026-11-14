import { applicationPacingControl } from './application-pacing-mcp-control.mjs';
import { applicationFeedbackControl } from './application-feedback-mcp-control.mjs';
import { applicationDraftControl } from './application-draft-mcp-control.mjs';
import { applicationHoldControl } from './application-hold-mcp-control.mjs';
import { applicationRetryControl } from './application-retry-mcp-control.mjs';
import { applicationLimitControl } from './application-limit-mcp-control.mjs';
import { hhCaptchaControl } from './hh-captcha-mcp-control.mjs';
import { createServer } from 'node:http';
import { setImmediate } from 'node:timers';
import { chromium } from 'playwright';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { choicePutFixture } from './choice-put-fixture.mjs';
import { resumeCacheFixture } from './resume-cache-fixture.mjs';
import { applicationNativeFixture } from './application-native-fixture.mjs';
import { resumeLanguageBrowserFixture } from './resume-language-browser-fixture.mjs';
import { applicationResumeNativeFixture } from './application-resume-native-fixture.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
});
let fixture;
const clock = { value: Date.UTC(2026, 10, 14), rejections: 0 };
const retryFixture = process.env.APPLICATION_RETRY_FIXTURE === '1';
const limitFixture = process.env.APPLICATION_LIMIT_FIXTURE === '1';
const pacingFixture = process.env.APPLICATION_PACING_FIXTURE === '1';
const popup = process.env.APPLICATION_POPUP_FIXTURE === '1';
const batchFixture = process.env.APPLICATION_BATCH_FIXTURE === '1';
const batchEffects = [];
try {
  const create =
    process.env.APPLICATION_RESUME_FIXTURE === '1'
      ? applicationResumeNativeFixture
      : process.env.RESUME_LANGUAGE_FIXTURE === '1'
        ? resumeLanguageBrowserFixture
        : process.env.APPLICATION_REVIEW_FIXTURE === '1'
          ? applicationNativeFixture
          : process.env.CHOICE_PUT_FAILURE === '1'
            ? choicePutFixture
            : process.env.RESUME_CACHE_FAILURE === '1'
              ? resumeCacheFixture
              : vacancyBrowserFixture;
  fixture = await create(browser, {
    popup,
    ...(batchFixture
      ? { onApplicationClose: (effect) => batchEffects.push(effect) }
      : {}),
    language: process.env.APPLICATION_LANGUAGE_FIXTURE === '1',
    ...(retryFixture || limitFixture || pacingFixture
      ? {
          application: {
            now: () => clock.value,
            ...(pacingFixture ? { pacingRandom: () => 0 } : {}),
          },
        }
      : {}),
  });
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
  ...(batchFixture ? { batchEffects } : {}),
  ...(fixture.failed ? { failedSaves: fixture.failed() } : {}),
});
const draftControl =
  process.env.APPLICATION_DRAFT_FIXTURE === '1'
    ? applicationDraftControl(browser, popup)
    : null;
const holdControl =
  process.env.APPLICATION_HOLD_FIXTURE === '1'
    ? applicationHoldControl(browser)
    : null;
const retryControl = retryFixture
  ? applicationRetryControl(browser, clock)
  : null;
const limitControl = limitFixture
  ? applicationLimitControl(browser, clock)
  : null;
const captchaControl =
  process.env.APPLICATION_HH_CAPTCHA_FIXTURE === '1'
    ? hhCaptchaControl(browser)
    : null;
const pacingControl = pacingFixture
  ? applicationPacingControl(fixture, clock)
  : null;
const handlers = [
  process.env.APPLICATION_FEEDBACK_FIXTURE === '1'
    ? applicationFeedbackControl(browser)
    : null,
  draftControl,
  holdControl,
  retryControl,
  limitControl,
  captchaControl,
  pacingControl,
];
const runControl = async (req) => {
  for (const handler of handlers) {
    const result = await handler?.(req);
    if (result) {
      return result;
    }
  }
};
const control = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/close') {
    res.end(JSON.stringify(stats()));
    setImmediate(close);
    return;
  }
  try {
    const draft = await runControl(req);
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
