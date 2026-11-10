import { createInterface } from 'node:readline';
import { listAnswerRules } from '../../js/src/automation/question-store.js';

/** Explicit fixture-only stdin actions simulate owner edits in the owned browser. */
export const controlFormMonitorFixture = async ({
  browsers,
  store,
  fixture,
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
      if (command.trim() !== 'next') {
        continue;
      }
      const page = [...browsers].at(-1)?.contexts()[0]?.pages()[0];
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
