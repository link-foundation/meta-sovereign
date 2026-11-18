// Execute the actual caller's opener against one finite native layout movement.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { followLinksFixture } from '../../js/tests/helpers/follow-links.mjs';
import { openFollowDisclosure } from '../../js/tests/helpers/follow-disclosure.mjs';

const source = await readFile('js/tests/e2e-follow-links-browser.mjs', 'utf8');
const calls = [
  ...source.matchAll(
    /await (?:panel\.locator\(':scope > summary'\)\.click\(\)|openFollowDisclosure\(panel\));/gu
  ),
];
assert.equal(calls.length, 2, 'Both actual caller openings must be covered');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const open = new AsyncFunction('panel', 'openFollowDisclosure', calls[0][0]);
const f = await followLinksFixture();
const { page, base, finish } = await openChatApp('follow-links-opening', f);
await finish(async () => {
  await page.goto(`${base}/#/automation`);
  const panel = page.locator('[data-follow-panel]');
  await panel.scrollIntoViewIfNeeded();
  const moving = new Proxy(panel, {
    get(target, key) {
      if (key === 'locator') {
        return (selector) => {
          const locator = target.locator(selector);
          return new Proxy(locator, {
            get(control, method) {
              if (method === 'click') {
                return async () => {
                  const box = await control.boundingBox();
                  await panel.evaluate((node) => {
                    node.style.transform = 'translateY(24px)';
                  });
                  await page.mouse.click(
                    box.x + box.width / 2,
                    box.y + box.height / 2
                  );
                };
              }
              const value = Reflect.get(control, method);
              return typeof value === 'function' ? value.bind(control) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await open(moving, openFollowDisclosure);
  const before = process.argv.includes('--before');
  const directory = 'docs/screenshots/issue-56-ci-follow-links';
  await mkdir(directory, { recursive: true });
  if (before) {
    assert.equal(await panel.evaluate((node) => node.open), false);
    await assert.rejects(
      panel.locator('[data-follow-results]').waitFor({ timeout: 1000 }),
      /Timeout/u
    );
  } else {
    assert.equal(await panel.evaluate((node) => node.open), true);
    await panel
      .getByText('0 cached message references', { exact: true })
      .waitFor();
    await panel.locator('[data-follow-action="extract"]').click();
    await panel
      .getByText('4 cached message references', { exact: true })
      .waitFor();
    const field = panel.getByLabel('Provider (blank: all)', { exact: true });
    await field.fill('vk');
    await open(panel, openFollowDisclosure);
    assert.equal(await field.inputValue(), 'vk');
    assert.equal(await panel.evaluate((node) => node.open), true);
  }
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${directory}/${before ? 'before' : 'after'}.png`,
  });
  console.log(
    JSON.stringify({
      parentFailureReproduced: before,
      coordinateShiftPx: 24,
      actualCallerOpenings: calls.length,
      preservedOwnerDraft: !before,
      originalHostedTimingReproduced: false,
      liveProvider: false,
    })
  );
});
