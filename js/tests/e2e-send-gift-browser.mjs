// Real browser e2e for sending a gift (R-Y185), as Telegram Desktop's
// "Send a gift": a person's info column has the button; it opens the
// catalogue (prices, "Limited" with how many are left, "Sold out" that
// cannot be picked); a picked gift takes a message and "Hide my name";
// Continue asks the last question with the price and the balance; only its
// Pay button sends (a refused price shows as words and nothing is done, a
// gift dearer than the balance cannot be paid). Telegram's answers faked in
// the page, a server on a free port, a headless browser; nothing reaches a
// network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:send-gift

import { assert, fulfil } from './helpers/e2e-chat.mjs';
import {
  PERSON,
  openAbout,
  openProfileApp,
} from './helpers/e2e-profile-chat.mjs';

const app = await openProfileApp('send-gift');
const { page, until, finish } = app;

const card = (id, stars, extra = {}) => ({
  id,
  stars,
  title: `Gift ${id}`,
  limited: false,
  soldOut: false,
  remains: null,
  total: null,
  premium: false,
  birthday: false,
  sticker: { id: String(900 + Number(id)), kind: 'sticker', format: 'webp' },
  ...extra,
});
let catalogueAsks = 0;
await page.route('**/api/telegram/gift-catalogue', (route) => {
  catalogueAsks += 1;
  return fulfil(route, {
    ok: true,
    gifts: [
      card('1', 15),
      card('2', 100, { limited: true, remains: 3, total: 10 }),
      card('3', 50, { limited: true, soldOut: true, remains: 0, total: 5 }),
      card('4', 500),
    ],
  });
});
const sends = [];
let answer = { ok: false, error: 'price changed', code: 'price' };
await page.route('**/api/telegram/gift-send', (route) => {
  sends.push(route.request().postDataJSON());
  return fulfil(route, answer);
});

const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);

await finish(async () => {
  await openAbout(app, PERSON);
  const button = page.locator('.person-panel [data-action="send-gift"]');
  await button.waitFor({ timeout: 10_000 });
  assert(catalogueAsks === 0, 'the catalogue is asked when the dialog opens');
  await button.click();
  const pick = page.locator('[data-dialog="gift-pick"]');
  await pick.locator('[data-gift-card="1"]').waitFor({ timeout: 5000 });
  const text = await pick.textContent();
  assert(text.includes('100 ⭐') && text.includes('15 ⭐'), `prices: ${text}`);
  assert(
    text.includes('3 left') && text.includes('Limited'),
    `limited with what is left: ${text}`
  );
  const sold = pick.locator('[data-gift-card="3"]');
  assert(
    (await sold.getAttribute('data-sold-out')) === 'true' &&
      (await sold.isDisabled()),
    'a sold-out gift cannot be picked'
  );
  assert((await sold.textContent()).includes('Sold out'), 'the sold-out mark');
  assert(
    await pick
      .locator('[data-action="cancel"] ~ button[type="submit"]')
      .isDisabled(),
    'Continue waits for a gift'
  );
  // Pick, message, hide my name, continue.
  await pick.locator('[data-gift-card="2"]').click();
  await pick.locator('[data-field="gift-text"]').fill('Happy birthday');
  await pick.locator('[data-field="gift-hide-name"]').check();
  await pick.locator('button[type="submit"]').click();
  const confirm = page.locator('[data-dialog="gift-confirm"]');
  await confirm.waitFor({ timeout: 5000 });
  const asked = await confirm.textContent();
  assert(
    asked.includes('100 ⭐') && asked.includes('Gift 2'),
    `the question names the gift and price: ${asked}`
  );
  await until(
    async () =>
      (await confirm.locator('[data-stars-balance]').textContent()).includes(
        '120'
      ),
    'the balance'
  );
  assert(asked.includes('Happy birthday'), 'the message');
  assert(sends.length === 0, 'nothing was sent before Pay');
  // Pay: a refused price is words, and the dialog stays.
  await confirm.locator('button[type="submit"]').click();
  await until(() => sends.length === 1, 'Pay sends');
  assert(
    JSON.stringify(sends[0]) ===
      JSON.stringify({
        chat: PERSON,
        gift: '2',
        stars: 100,
        text: 'Happy birthday',
        hideName: true,
      }),
    `the request: ${JSON.stringify(sends[0])}`
  );
  await confirm.locator('[role="alert"]').waitFor({ timeout: 5000 });
  assert(
    (await confirm.locator('[role="alert"]').textContent()).includes(
      'price changed'
    ),
    'the refusal is words'
  );
  // Escape goes back to the catalogue; a gift dearer than the balance
  // cannot be paid.
  await page.keyboard.press('Escape');
  await pick.locator('[data-gift-card="4"]').waitFor({ timeout: 5000 });
  await pick.locator('[data-gift-card="4"]').click();
  await pick.locator('button[type="submit"]').click();
  await confirm.waitFor({ timeout: 5000 });
  await until(
    async () =>
      (await confirm.locator('[data-stars-balance]').textContent()).includes(
        '120'
      ),
    'the balance is known'
  );
  assert(
    await confirm.locator('button[type="submit"]').isDisabled(),
    'a gift dearer than the balance cannot be paid'
  );
  assert(
    (await confirm.textContent()).includes('Not enough Stars'),
    'the balance problem in words'
  );
  await page.keyboard.press('Escape');
  // A cheap gift, paid.
  answer = { ok: true, paid: 15 };
  await pick.locator('[data-gift-card="1"]').click();
  await pick.locator('button[type="submit"]').click();
  await confirm.waitFor({ timeout: 5000 });
  await confirm.locator('button[type="submit"]').click();
  await gone(confirm, 'the dialog closes after the payment');
  await page
    .locator('.person-panel [data-gift-sent]')
    .waitFor({ timeout: 5000 });
  assert(sends.length === 2, `two sends in all: ${sends.length}`);
  assert(sends[1].stars === 15 && sends[1].gift === '1', 'the cheap gift');
});
