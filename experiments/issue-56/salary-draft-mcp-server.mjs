import { chromium } from 'playwright';
import { questionBrowserServer } from './question-browser-server.mjs';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { mountSalaryHistory } from './salary-browser-history.mjs';

export const salaryDraftMcpServer = async ({
  question,
  rules = [],
  options,
  recent,
}) => {
  const browser = await chromium.launch({
    executablePath:
      process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  const fixture = await questionBrowserServer(browser);
  try {
    for (const rule of rules) {
      await saveAnswerRule(fixture.store, rule);
    }
    await fixture.reset({ freeText: !options, question, options });
    await mountSalaryHistory(fixture, recent);
    console.log(JSON.stringify({ base: fixture.base, liveProvider: false }));
    process.stdin.resume();
    await new Promise((resolve) => process.stdin.once('data', resolve));
  } finally {
    process.stdin.pause();
    const stats = await fixture.stats();
    await fixture.close();
    await browser.close();
    console.log(
      JSON.stringify({ stats, resourcesClosed: true, liveProvider: false })
    );
  }
};
