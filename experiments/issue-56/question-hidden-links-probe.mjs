// One disposable chat, two link destinations and at most one native choice.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { questionBrowserServer } from './question-browser-server.mjs';
import { previewAnswer } from '../../js/src/automation/question-store.js';
import { browserChoiceDraft } from '../../js/src/automation/question-browser-state.js';

const browser = await chromium.launch({
  executablePath: process.env.E2E_EXECUTABLE_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
let fixture;
try {
  fixture = await questionBrowserServer(browser);
  const target = { source: 'hh', chat: '7' };
  await fixture.send.readAnswerChoices(target);
  await fixture.page.evaluate(() => {
    const bubble = document.querySelector('[data-qa="chat-bubble-text"]');
    const anchor = document.createElement('a');
    anchor.href = 'https://company.test/information';
    anchor.textContent = 'distributed systems';
    bubble.replaceChildren('Do you have ', anchor, ' experience?');
  });
  const first = await fixture.send.readAnswerChoices(target);
  const plan = await previewAnswer(fixture.store, {
    question: first.question.body,
    options: first.answerOptions,
    strictOptions: first.strictOptions,
  });
  await fixture.page.evaluate(() => {
    document.querySelector('[data-qa="chat-bubble-text"] a').href =
      'https://other.test/assignment';
  });
  const second = await fixture.send.readAnswerChoices(target);
  const changedHrefIgnored = JSON.stringify(first) === JSON.stringify(second);
  assert.equal(changedHrefIgnored, true);
  assert.equal(plan.requiresReview, false);
  const receipt = await fixture.send(
    browserChoiceDraft({ target, snapshot: first }, plan.text)
  );
  const stats = await fixture.stats();
  assert.equal(stats.clicks, 1);
  console.log(
    JSON.stringify({
      changedHrefIgnored,
      plan,
      first,
      second,
      receipt,
      stats,
      liveProvider: false,
    })
  );
} finally {
  await fixture?.close();
  await browser.close();
  console.log(JSON.stringify({ resourcesClosed: true }));
}
