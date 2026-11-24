import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { withNativeApplicationChats } from '../../js/tests/helpers/application-chats-browser-fixture.mjs';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';

const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: [
    '--disable-dev-shm-usage',
    '--renderer-process-limit=2',
    '--disable-site-isolation-trials',
  ],
});
let final;
const session = process.env.APPLICATION_CHAT_SESSION_REUSE === '1';
const rejections = process.env.APPLICATION_CHAT_REJECTIONS === '1';
try {
  await withNativeApplicationChats(
    browser,
    async ({ fixture, stats }) => {
      await saveAnswerRule(fixture.store, {
        id: 'start-time',
        question: 'What time can you start?',
        answers: [{ text: 'At 9 a.m.', approved: true }],
      });
      const control = createServer(async (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(await stats()));
      });
      await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
      console.log(
        JSON.stringify({
          pid: process.pid,
          base: fixture.base,
          control: `http://127.0.0.1:${control.address().port}`,
          session,
          rejections,
        })
      );
      try {
        await new Promise((resolve) => {
          process.once('SIGTERM', resolve);
          process.once('SIGINT', resolve);
        });
        final = await stats();
      } finally {
        await new Promise((resolve) => control.close(resolve));
      }
    },
    { session, rejections }
  );
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ...final, resourcesClosed: true }));
