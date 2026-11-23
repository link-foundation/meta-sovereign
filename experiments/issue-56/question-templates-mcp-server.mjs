import { chromium } from 'playwright';
import { questionBrowserServer } from './question-browser-server.mjs';
import {
  templateBoundaryExample,
  templateExample,
  templateLinkExample,
  templateRequestExample,
  mountTemplateQuestion,
} from './question-template-fixture.mjs';
import {
  hiddenLink,
  mountHiddenQuestionLink,
} from './question-hidden-links-fixture.mjs';

const browser = await chromium.launch({
  executablePath: process.env.E2E_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  handleSIGINT: false,
  handleSIGTERM: false,
  args: ['--disable-dev-shm-usage'],
});
let fixture;
let closing;
const close = () =>
  (closing ??= (async () => {
    let stats;
    try {
      stats = await fixture?.stats();
    } finally {
      await fixture?.close();
      await browser.close();
    }
    console.log(
      JSON.stringify({ resourcesClosed: true, stats, liveProvider: false })
    );
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
try {
  fixture = await questionBrowserServer(browser);
  const hidden = process.argv.includes('--hidden-links');
  if (!hidden) {
    await fixture.store.delete('qa-rule:experience');
    await fixture.reset({ freeText: true });
  }
  await fixture.send.readAnswerChoices({ source: 'hh', chat: '7' });
  const example =
    [
      ['--link-guard', templateLinkExample],
      ['--request-guard', templateRequestExample],
      ['--boundary-guard', templateBoundaryExample],
    ].find(([flag]) => process.argv.includes(flag))?.[1] ?? templateExample;
  if (hidden) {
    await fixture.page.evaluate(mountHiddenQuestionLink, hiddenLink.first);
  } else {
    await fixture.page.evaluate(mountTemplateQuestion, example.question);
  }
  console.log(
    JSON.stringify({
      pid: process.pid,
      base: fixture.base,
      liveProvider: false,
    })
  );
} catch (error) {
  await close();
  throw error;
}
