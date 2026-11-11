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
export const runBrowserScenarios = async (
  group,
  scenarios,
  { nativeFocus = false } = {}
) => {
  const { engine, browserType } = await browserOf(group);
  // The headless shell reports both tabs focused. Native focus checks need
  // the full Chromium binary already installed by the browser CI lane.
  const executablePath =
    process.env.E2E_EXECUTABLE_PATH ||
    (nativeFocus && engine === 'chromium'
      ? browserType.executablePath()
      : undefined);
  const browser = await browserType.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
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
