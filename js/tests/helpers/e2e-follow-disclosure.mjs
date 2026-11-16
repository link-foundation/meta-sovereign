import assert from 'node:assert/strict';
import { openFollowDisclosure } from './follow-disclosure.mjs';

/** A finite coordinate miss, native activation and retained owner edit. */
export const verifyFollowDisclosure = async (page, directory) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setContent(`<!doctype html><html lang="en"><style>
    body{font:16px system-ui;margin:40px} details{padding:16px;border:1px solid #abc}
    summary{height:23px} select,input{display:block;margin:12px 0}
  </style><h1>Follow disclosure fixture</h1><p>Finite reproduction of the hosted coordinate miss.</p>
  <details><summary>Follow: post and monitor backlinks</summary>
    <select aria-label="Source"><option>VK</option><option>Telegram</option></select>
    <input aria-label="Unsaved draft" value="Retain this owner draft">
  </details></html>`);
  const card = page.locator('details');
  const summary = card.locator('summary');
  const box = await summary.boundingBox();
  // Reproduce the observed 21px movement between coordinate selection and down.
  await card.evaluate((node) => {
    node.style.transform = 'translateY(21px)';
  });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(await card.evaluate((node) => node.open), false);
  await assert.rejects(
    page.getByLabel('Source').selectOption('Telegram', { timeout: 1000 }),
    /not visible/
  );
  if (directory) {
    await page.screenshot({ path: `${directory}/before.png` });
  }
  // Inject the same movement after a pointer opener has chosen its coordinates.
  // Keyboard focus/activation uses the real unchanged locator methods.
  const moving = new Proxy(card, {
    get(target, key) {
      if (key === 'locator') {
        return (selector) => {
          const locator = target.locator(selector);
          return new Proxy(locator, {
            get(control, method) {
              if (method === 'click') {
                return async () => {
                  const previous = await control.boundingBox();
                  await card.evaluate((node) => {
                    node.style.transform = 'translateY(42px)';
                  });
                  await page.mouse.click(
                    previous.x + previous.width / 2,
                    previous.y + previous.height / 2
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
  await openFollowDisclosure(moving);
  await page.getByLabel('Source').selectOption('Telegram');
  await page
    .getByLabel('Unsaved draft')
    .fill('Owner edit survives repeated opening');
  await openFollowDisclosure(card);
  assert.equal(
    await page.getByLabel('Unsaved draft').inputValue(),
    'Owner edit survives repeated opening'
  );
  if (directory) {
    await page.screenshot({ path: `${directory}/after.png` });
  }
  assert.deepEqual(errors, []);
  return {
    missedPointerReproduced: true,
    nativeKeyboardOpened: true,
    repeatedOpeningPreservedDraft: true,
    errors,
    providerEffects: 0,
  };
};
