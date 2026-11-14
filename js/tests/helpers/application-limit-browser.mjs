import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';

export const applicationLimitBrowser = async (browser, screenshots, prefix) => {
  const clock = { value: Date.UTC(2026, 10, 14) };
  const fixture = await applicationNativeFixture(browser, {
    application: { now: () => clock.value },
  });
  const controls = applicationPanelBrowser(fixture);
  return {
    fixture,
    clock,
    controls,
    panel: controls.panel,
    action: controls.action,
    shot: controls.screenshot(screenshots, prefix),
  };
};
