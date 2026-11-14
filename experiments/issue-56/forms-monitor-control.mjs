import { createInterface } from 'node:readline';
import { listAnswerRules } from '../../js/src/automation/question-store.js';

const learningAction = async (action, page) => {
  if (action === 'edit') {
    await page
      .locator('[name="learningAnswer"]')
      .fill('MCP owner builds resilient storage; contact ada@example.test');
  } else if (action === 'next') {
    await page.locator('#next').click();
    await page.waitForURL('**/learning?page=2');
  } else if (action === 'submit') {
    await page
      .locator('[name="learningAnswer"]')
      .fill('MCP owner can start after the notice period');
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await page.getByRole('status').waitFor();
  }
};

const fixtureActions = (learning, captcha) => [
  'next',
  ...(learning ? ['edit', 'submit', 'state'] : []),
  ...(captcha ? ['release'] : []),
];

const releaseCaptcha = async ({ captcha, page, action, fixture }) => {
  if (
    captcha &&
    page &&
    action === 'release' &&
    new URL(page.url()).pathname === '/captcha'
  ) {
    await page.locator('#owner-clear').click();
    console.log(
      JSON.stringify({
        action: 'owner-captcha-release',
        challengeReads: await page.evaluate(() => globalThis.challengeReads),
        submissions: fixture.submits,
      })
    );
    return true;
  }
  return false;
};

/** Explicit fixture-only stdin actions simulate owner edits in the owned browser. */
export const controlFormMonitorFixture = async ({
  browsers,
  store,
  fixture,
  learning = false,
  captcha = false,
}) => {
  const rules = JSON.stringify(await listAnswerRules(store));
  const input = createInterface({ input: process.stdin, terminal: false });
  const close = () => input.close();
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  try {
    for await (const command of input) {
      if (command.trim() === 'quit') {
        break;
      }
      const action = command.trim();
      if (!fixtureActions(learning, captcha).includes(action)) {
        continue;
      }
      const page = [...browsers].at(-1)?.contexts()[0]?.pages()[0];
      if (await releaseCaptcha({ captcha, page, action, fixture })) {
        continue;
      }
      if (learning && page) {
        await learningAction(action, page);
        console.log(
          JSON.stringify({
            action,
            rules: await listAnswerRules(store),
            submissions: fixture.submits,
          })
        );
        continue;
      }
      if (
        page &&
        new URL(page.url()).pathname === '/monitor' &&
        !new URL(page.url()).search
      ) {
        await page.evaluate(() => {
          const field = globalThis.document.querySelector(
            '[name="monitorAnswer"]'
          );
          field.value = 'MCP owner answer before Next';
          field.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
          globalThis.document.querySelector('#next').click();
        });
        await page.waitForURL('**/monitor?page=2');
        await page
          .locator('[name="monitorAnswer"]')
          .fill('MCP owner answer on page two');
      }
      console.log(
        JSON.stringify({
          action: 'next',
          rulesUnchanged:
            rules === JSON.stringify(await listAnswerRules(store)),
          submissions: fixture.submits,
        })
      );
    }
  } finally {
    input.close();
    process.removeListener('SIGINT', close);
    process.removeListener('SIGTERM', close);
  }
};
