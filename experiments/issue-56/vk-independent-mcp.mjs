import { writeFile } from 'node:fs/promises';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { independentVkKinds as kinds } from './vk-independent-fixture.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const inspect = async (page, fixture) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.addInitScript(([key, value]) => {
    globalThis.localStorage.setItem(key, value);
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  }, fixture.tutorial);
  await page.goto(`${fixture.base}/#conn-vk/manual`);
  const ready = () =>
    page.waitForFunction(
      (names) =>
        names.every((name) => {
          const input = document.querySelector(
            `[data-action=vk-${name}-enabled]`
          );
          return input && !input.disabled;
        }),
      fixture.kinds
    );
  const states = async (selected) => {
    await ready();
    const observed = await page.evaluate(
      (names) =>
        names.map(
          (name) =>
            document.querySelector(`[data-action=vk-${name}-enabled]`).checked
        ),
      fixture.kinds
    );
    if (
      observed.some(
        (value, index) => value !== (fixture.kinds[index] === selected)
      )
    ) {
      throw Error('Independent switch state was not retained');
    }
  };
  const change = async (kind, action) => {
    const pending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/vk/${kind}` &&
        response.request().method() === 'POST'
    );
    await page.locator(`[data-action=vk-${kind}-${action}]`).click();
    if ((await pending).status() !== 200) {
      throw Error('Policy save was refused');
    }
    await ready();
  };
  await states(null);
  await page.locator('[data-wall-field=communities]').fill('42');
  await change('wall', 'save');
  for (const kind of fixture.kinds) {
    await change(kind, 'enabled');
    await page.reload();
    await states(kind);
    await change(kind, 'enabled');
    await states(null);
  }
  if (errors.length) {
    throw Error(JSON.stringify(errors));
  }
  return {
    independentPolicies: 6,
    acknowledgedToggles: 12,
    reloads: 6,
    errors,
    liveProvider: false,
  };
};
await writeFile(
  'ci-logs/vk-independent-mcp-code.js',
  mcpInspectionCode(inspect, {
    base: process.argv[2],
    kinds,
    tutorial: [
      TUTORIAL_STORAGE_KEY,
      JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
    ],
  })
);
