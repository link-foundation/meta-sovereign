import { browserOf } from './e2e-chat.mjs';

export const traceBrowserScenario = async (group, scenario, work) => {
  const start = Date.now();
  const trace = (phase, extra = {}) =>
    console.log(
      '[browser-scenario]',
      JSON.stringify({
        group,
        scenario,
        phase,
        at: new Date().toISOString(),
        ...extra,
      })
    );
  trace('started');
  try {
    const result = await work();
    trace('passed', { elapsedMs: Date.now() - start, result });
    return result;
  } catch (error) {
    trace('failed', { elapsedMs: Date.now() - start });
    throw error;
  }
};

/** Standalone bounded CI groups; every scenario retains its own fixture cleanup. */
export const runBrowserScenarios = async (group, scenarios) => {
  const { engine, browserType } = await browserOf(group);
  const browser = await browserType.launch({
    headless: true,
    ...(process.env.E2E_EXECUTABLE_PATH
      ? { executablePath: process.env.E2E_EXECUTABLE_PATH }
      : {}),
  });
  try {
    for (const verify of scenarios) {
      await traceBrowserScenario(group, verify.name, () => verify(browser));
    }
    console.log(`[e2e-${group}] OK (${engine})`);
  } finally {
    await browser.close();
  }
};
