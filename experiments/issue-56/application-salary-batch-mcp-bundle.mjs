import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { applicationAnswerMcpRunner } from './application-answer-context-mcp-runner.mjs';
import { exerciseSalaryBatchUi } from './application-salary-batch-ui.mjs';

const directory = fileURLToPath(
  new URL(
    '../../docs/screenshots/issue-56-application-salary-batch/',
    import.meta.url
  )
);
const work = `async (page, panel, configure, fixture) => {
  const url = new URL(page.url());
  const before = url.searchParams.get('phase') === 'before';
  const stats = url.searchParams.get('stats');
  if (!stats || !['before', 'after'].includes(url.searchParams.get('phase'))) {
    throw new Error('Supply the owned stats URL and phase.');
  }
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript((phase) => {
    if (globalThis.localStorage.getItem('salary-batch-evidence-phase') !== phase) {
      globalThis.localStorage.removeItem('meta-sovereign:hh-application-intent');
      globalThis.localStorage.setItem('salary-batch-evidence-phase', phase);
    }
    globalThis.localStorage.setItem('metaSovereignTutorial', '{"off":true,"v":5}');
  }, url.searchParams.get('phase'));
  await page.setViewportSize({ width: 1200, height: 1050 });
  const exercise = ${exerciseSalaryBatchUi.toString()};
  const result = await exercise(page, panel, configure, { before,
    screenshot: async (name, batch) => {
      const receipt = batch.locator('[data-application-batch-phase]');
      await receipt.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      await receipt.screenshot({ path: fixture.directory + 'application-salary-batch-' + name + '.png' });
    }
  });
  const native = await (await page.request.get(stats)).json();
  const sends = native.outcomes.reduce((n, row) => n + row.attempts, 0);
  if (sends !== result.deliveries || !native.closed || errors.length || native.errors.length) {
    throw new Error(JSON.stringify({ result, native, errors }));
  }
  return { ...result, native, errors, liveProvider: false };
}`;
await writeFile(
  new URL(
    '../../ci-logs/application-salary-batch-mcp-runner.js',
    import.meta.url
  ),
  applicationAnswerMcpRunner(work, { directory })
);
