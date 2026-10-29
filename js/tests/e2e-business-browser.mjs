// Real browser e2e for Telegram Business (R-Y180), as Telegram Desktop's
// Settings → Telegram Business has it: opening hours (days, a time zone,
// Save sends the exact weekly list; a Premium refusal is words), the
// location, the start page (intro) with a sticker, chat links (list with
// views, copy, create, edit, delete behind a question), the connected
// bot (change, disconnect behind a question); on a business's profile
// "Open now / Closed", today and the week, and the address; its intro in
// an empty chat; a t.me/m/<slug> link in a message that opens the chat with
// the text in the box (not sent); the bar over a chat a bot manages (pause,
// resume, remove behind a question); and folder tags (shown on rows, the
// switch refused without Premium, a colour chosen in the folder editor).
// Nothing is sent until Save or a confirmation. Telegram's answers faked in
// the page, fake chats in a memory store, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:business

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const SHOP = '700'; // a business, open all week
const NIGHT = '710'; // closed, managed by a bot
const FRIEND = '800'; // sends a business chat link
const EMPTY = '900'; // an empty chat with a business
const LINK_TEXT = 'Hello, I saw your promo!';

const store = createMemoryStore();
const at = Date.now();
const people = [
  [SHOP, 'Fake Shop', 'Welcome to the shop', 60_000],
  [NIGHT, 'Night Owl', 'We open rarely', 120_000],
  [FRIEND, 'Fake Friend', 'Try https://t.me/m/Promo1 today', 30_000],
];
for (const [chat, name, body, ago] of people) {
  await store.put({
    id: `msg:telegram:${chat}:1`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: 'private',
    sender: chat,
    senderName: name,
    body,
    timestamp: new Date(at - ago).toISOString(),
    raw: { id: 1 },
  });
}

const { base, page, until, finish } = await openChatApp('business', {
  store,
});

const refused = { premium: false };
const PREMIUM = {
  ok: false,
  code: 'premium',
  error: 'PREMIUM_ACCOUNT_REQUIRED',
};
const sent = {
  hours: [],
  location: [],
  intro: [],
  create: [],
  edit: [],
  remove: [],
  bot: [],
  disconnect: [],
  pause: [],
  disable: [],
  tags: [],
  folder: [],
  resolve: [],
};
const answer = (route, name, ok = { ok: true }) => {
  const body = route.request().postDataJSON();
  sent[name].push(body);
  if (refused.premium) {
    return fulfil(route, PREMIUM);
  }
  return fulfil(route, ok);
};

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: 'Lee',
    about: '',
    username: 'annlee',
    phone: '+15551234567',
    hasPhoto: false,
    aboutMax: 70,
  })
);

// Hours.
const BERLIN = { id: 'Europe/Berlin', name: 'Berlin', offset: 3600 };
const TOKYO = { id: 'Asia/Tokyo', name: 'Tokyo', offset: 32_400 };
const myHours = {
  timezone: 'Europe/Berlin',
  weekly: [{ start: 540, end: 1080 }],
  openNow: false,
};
await page.route('**/api/telegram/business-hours', (route) =>
  fulfil(route, { ok: true, hours: myHours, timezones: [BERLIN, TOKYO] })
);
await page.route('**/api/telegram/business-hours-set', (route) =>
  answer(route, 'hours')
);
await page.route('**/api/telegram/business-location', (route) =>
  fulfil(route, { ok: true, location: null })
);
await page.route('**/api/telegram/business-location-set', (route) =>
  answer(route, 'location')
);
await page.route('**/api/telegram/business-intro', (route) =>
  fulfil(route, { ok: true, intro: null })
);
await page.route('**/api/telegram/business-intro-stickers', (route) =>
  fulfil(route, {
    ok: true,
    stickers: [{ id: '21', kind: 'sticker', format: 'webp', emoji: '👋' }],
  })
);
await page.route('**/api/telegram/business-intro-set', (route) =>
  answer(route, 'intro')
);

// Chat links.
let links = [
  {
    slug: 'abc',
    link: 'https://t.me/m/abc',
    message: 'Hello',
    title: 'Promo',
    views: 3,
  },
];
await page.route('**/api/telegram/business-links', (route) =>
  fulfil(route, { ok: true, links })
);
await page.route('**/api/telegram/business-link-create', (route) => {
  const body = route.request().postDataJSON();
  sent.create.push(body);
  const link = {
    slug: 'new1',
    link: 'https://t.me/m/new1',
    message: body.message,
    title: body.title ?? '',
    views: 0,
  };
  links = [link, ...links];
  return fulfil(route, { ok: true, link });
});
await page.route('**/api/telegram/business-link-edit', (route) => {
  const body = route.request().postDataJSON();
  sent.edit.push(body);
  const link = {
    slug: body.slug,
    link: `https://t.me/m/${body.slug}`,
    message: body.message,
    title: body.title ?? '',
    views: 3,
  };
  links = links.map((l) => (l.slug === body.slug ? link : l));
  return fulfil(route, { ok: true, link });
});
await page.route('**/api/telegram/business-link-delete', (route) => {
  const body = route.request().postDataJSON();
  sent.remove.push(body);
  links = links.filter((l) => l.slug !== body.slug);
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/business-link-resolve', (route) => {
  sent.resolve.push(route.request().postDataJSON());
  return fulfil(route, {
    ok: true,
    chat: SHOP,
    name: 'Fake Shop',
    text: LINK_TEXT,
  });
});

// The connected bot.
const bot = {
  id: '500',
  username: 'shop_bot',
  name: 'Shop Bot',
  canReply: true,
  rights: { reply: true },
  recipients: {
    existingChats: true,
    newChats: false,
    contacts: false,
    nonContacts: false,
    excludeSelected: false,
    users: [],
    excludeUsers: [],
  },
};
let connectedBot = bot;
await page.route('**/api/telegram/business-bot', (route) =>
  fulfil(route, { ok: true, bot: connectedBot })
);
await page.route('**/api/telegram/business-bot-set', (route) =>
  answer(route, 'bot')
);
await page.route('**/api/telegram/business-bot-remove', (route) => {
  sent.disconnect.push(route.request().postDataJSON());
  connectedBot = null;
  return fulfil(route, { ok: true, bot: null });
});

// What a profile and an empty chat show, and the bot's bar.
const ALL_WEEK = Array.from({ length: 7 }, (_, i) => ({
  start: i * 1440,
  end: (i + 1) * 1440,
}));
const profile = (chat) => {
  if (chat === SHOP) {
    return {
      ok: true,
      hours: {
        timezone: 'Pacific/Kiritimati',
        weekly: ALL_WEEK,
        openNow: true,
      },
      location: {
        address: '1 Market Street',
        point: { lat: 52.5, lon: 13.4 },
      },
      intro: null,
    };
  }
  if (chat === NIGHT) {
    return {
      ok: true,
      hours: {
        timezone: 'Europe/Berlin',
        weekly: [{ start: 3 * 60, end: 3 * 60 + 1 }],
        openNow: false,
      },
      location: null,
      intro: null,
    };
  }
  if (chat === EMPTY) {
    return {
      ok: true,
      hours: null,
      location: null,
      intro: {
        title: 'Welcome!',
        description: 'Ask me anything',
        sticker: null,
      },
    };
  }
  return { ok: true, hours: null, location: null, intro: null };
};
await page.route('**/api/telegram/business-profile', (route) =>
  fulfil(route, profile(route.request().postDataJSON().chat))
);
let barOf = {
  id: '500',
  name: 'Shop Bot',
  paused: false,
  canReply: true,
  manageUrl: '',
};
await page.route('**/api/telegram/business-bot-chat', (route) =>
  fulfil(route, {
    ok: true,
    bar: route.request().postDataJSON().chat === NIGHT ? barOf : null,
  })
);
await page.route('**/api/telegram/business-bot-pause', (route) => {
  const body = route.request().postDataJSON();
  sent.pause.push(body);
  barOf = { ...barOf, paused: body.paused };
  return fulfil(route, { ok: true, paused: body.paused });
});
await page.route('**/api/telegram/business-bot-disable', (route) => {
  sent.disable.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

// Folders and their tags.
let tagsOn = true;
let folders = [
  {
    id: 2,
    title: 'Work',
    emoticon: null,
    color: 3,
    groups: false,
    include: [SHOP],
    exclude: [],
    pinned: [],
  },
];
const folderList = () => ({
  ok: true,
  tags: tagsOn,
  folders: [...folders, { id: 0, all: true }],
});
await page.route('**/api/telegram/folders', (route) =>
  fulfil(route, folderList())
);
await page.route('**/api/telegram/folders-suggested', (route) =>
  fulfil(route, { ok: true, suggested: [] })
);
await page.route('**/api/telegram/folder-save', (route) => {
  const body = route.request().postDataJSON();
  sent.folder.push(body);
  folders = [...folders, { id: 5, ...body.folder }];
  return fulfil(route, { ok: true, id: 5 });
});
await page.route('**/api/telegram/folders-tags-set', (route) => {
  const body = route.request().postDataJSON();
  sent.tags.push(body);
  if (refused.premium) {
    return fulfil(route, PREMIUM);
  }
  tagsOn = body.enabled;
  return fulfil(route, { ok: true, enabled: tagsOn });
});

const toSettings = () => page.locator('button[data-view="settings"]').click();
const toChats = () => page.locator('button[data-view="chat"]').click();
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const menu = page.locator('[data-dialog="business"]');
const openSection = async (id) => {
  // Closing a section brings the menu back; else it opens from My profile.
  if ((await menu.count()) === 0) {
    await page.locator('button[data-view="profile"]').click();
    await page.locator('[data-action="my-profile"]').click();
    await page.locator('[data-action="open-business"]').click();
  }
  await menu.waitFor({ timeout: 5000 });
  const titles = await menu
    .locator('[data-section]')
    .evaluateAll((list) => list.map((b) => b.dataset.section));
  assert(
    JSON.stringify(titles) ===
      '["location","hours","quick-replies","greeting","away","intro","links","bots"]',
    `the sections: ${titles}`
  );
  await menu.locator(`[data-section="${id}"]`).click();
};
const closeAll = async () => {
  // Escape closes the dialog on top, one at a time.
  for (let i = 0; i < 5; i += 1) {
    if ((await page.locator('[data-dialog]').count()) === 0) {
      return;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }
  assert(
    (await page.locator('[data-dialog]').count()) === 0,
    'every dialog closed'
  );
};
const text = async (locator) => (await locator.textContent()) ?? '';

const hoursSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${SHOP}"]`).waitFor();
  await openSection('hours');
  const dialog = page.locator('[data-dialog="business-hours"]');
  await dialog.waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('[data-field="hours-enabled"]').isChecked()) === true,
    'hours are on'
  );
  assert(
    (await dialog
      .locator('[data-day="0"] [data-field="day-open"]')
      .isChecked()) === true,
    'Monday is open'
  );
  assert(
    (await dialog
      .locator('[data-day="1"] [data-field="day-open"]')
      .isChecked()) === false,
    'Tuesday is closed'
  );
  assert(sent.hours.length === 0, 'nothing sent before Save');
  await dialog.locator('[data-field="zone"]').selectOption('Asia/Tokyo');
  await dialog.locator('[data-day="0"] [data-field="from"]').fill('08:30');
  await dialog.locator('[data-day="1"] [data-field="day-open"]').check();
  await dialog.locator('[data-day="2"] [data-field="day-open"]').check();
  await dialog.locator('[data-day="2"] [data-field="day-all"]').check();
  // Two intervals in a day.
  await dialog.locator('[data-day="1"] [data-action="range-add"]').click();
  assert(
    (await dialog.locator('[data-day="1"] [data-field="from"]').count()) === 2,
    'a second interval'
  );
  // Overlapping times are refused in the page, with nothing sent.
  await dialog
    .locator('[data-day="1"] [data-field="from"]')
    .nth(1)
    .fill('10:00');
  await dialog.locator('[data-day="1"] [data-field="to"]').nth(1).fill('12:00');
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[role="alert"]').waitFor();
  assert((await text(dialog)).includes('must not overlap'), 'overlap is words');
  assert(sent.hours.length === 0, 'an invalid week is not sent');
  await dialog
    .locator('[data-day="1"] [data-field="from"]')
    .nth(1)
    .fill('19:00');
  await dialog.locator('[data-day="1"] [data-field="to"]').nth(1).fill('21:00');
  // A Premium refusal is words; the dialog stays.
  refused.premium = true;
  await dialog.locator('[data-action="submit"]').click();
  await until(() => sent.hours.length === 1, 'the first Save');
  await until(
    async () => (await text(dialog)).includes('needs Telegram Premium'),
    'the Premium refusal in words'
  );
  refused.premium = false;
  await dialog.locator('[data-action="submit"]').click();
  await until(() => sent.hours.length === 2, 'the second Save');
  // Tuesday's two intervals stay apart; Wednesday is all day.
  assert(
    JSON.stringify(sent.hours[1]) ===
      JSON.stringify({
        timezone: 'Asia/Tokyo',
        weekly: [
          { start: 510, end: 1080 },
          { start: 1980, end: 2520 },
          { start: 2580, end: 2700 },
          { start: 2880, end: 4320 },
        ],
      }),
    `the hours sent: ${JSON.stringify(sent.hours[1])}`
  );
  await gone(dialog, 'the dialog closes once saved');
  // "Show opening hours" off clears them.
  await openSection('hours');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-field="hours-enabled"]').uncheck();
  await dialog.locator('[data-action="submit"]').click();
  await until(() => sent.hours.length === 3, 'cleared');
  assert(sent.hours[2].weekly.length === 0, 'no weekly hours');
  await closeAll();
};

const placeSteps = async () => {
  await openSection('location');
  const dialog = page.locator('[data-dialog="business-location"]');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-field="lat"]').fill('52,5');
  await dialog.locator('[data-field="lon"]').fill('13.4');
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[role="alert"]').waitFor();
  assert((await text(dialog)).includes('needs an address'), 'address asked');
  assert(sent.location.length === 0, 'not sent without an address');
  await dialog.locator('[data-field="address"]').fill('1 Market Street');
  await dialog.locator('[data-action="submit"]').click();
  await until(() => sent.location.length === 1, 'saved');
  assert(
    JSON.stringify(sent.location[0]) ===
      JSON.stringify({ address: '1 Market Street', lat: 52.5, lon: 13.4 }),
    `the place: ${JSON.stringify(sent.location[0])}`
  );
  await gone(dialog, 'the dialog closes');
  await closeAll();
};

const introSteps = async () => {
  await openSection('intro');
  const dialog = page.locator('[data-dialog="business-intro"]');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-field="intro-title"]').fill('Hello there');
  await dialog.locator('[data-field="intro-description"]').fill('Ask us');
  await dialog.locator('[data-action="sticker-choose"]').click();
  await dialog.locator('[data-sticker="21"]').click();
  await dialog.locator('[data-field="sticker"]').waitFor();
  assert(sent.intro.length === 0, 'nothing sent before Save');
  await dialog.locator('[data-action="submit"]').click();
  await until(() => sent.intro.length === 1, 'saved');
  assert(
    JSON.stringify(sent.intro[0]) ===
      JSON.stringify({
        title: 'Hello there',
        description: 'Ask us',
        sticker: '21',
      }),
    `the intro: ${JSON.stringify(sent.intro[0])}`
  );
  await closeAll();
};

const linkSteps = async () => {
  await page.evaluate(() => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        writeText: async (value) => {
          globalThis.__copied = value;
        },
      },
      configurable: true,
    });
  });
  await openSection('links');
  const dialog = page.locator('[data-dialog="business-links"]');
  await dialog.waitFor({ timeout: 5000 });
  const row = dialog.locator('[data-slug="abc"]');
  await row.waitFor();
  assert((await text(row)).includes('3 views'), `views: ${await text(row)}`);
  assert((await text(row)).includes('Promo'), 'the name');
  await row.locator('[data-action="link-copy"]').click();
  await until(
    () => page.evaluate(() => globalThis.__copied === 'https://t.me/m/abc'),
    'the link copied'
  );
  // Create: an empty message is refused in the page.
  await dialog.locator('[data-action="link-create"]').click();
  const form = page.locator('[data-dialog="business-link-form"]');
  await form.locator('[data-action="submit"]').click();
  await form.locator('[role="alert"]').waitFor();
  assert(sent.create.length === 0, 'an empty link is not sent');
  await form.locator('[data-field="link-message"]').fill('Hi from the sale');
  await form.locator('[data-field="link-title"]').fill('Sale');
  await form.locator('[data-action="submit"]').click();
  await until(() => sent.create.length === 1, 'created');
  assert(
    JSON.stringify(sent.create[0]) ===
      JSON.stringify({ message: 'Hi from the sale', title: 'Sale' }),
    `created: ${JSON.stringify(sent.create[0])}`
  );
  await dialog.locator('[data-slug="new1"]').waitFor();
  // Edit.
  await row.locator('[data-action="link-edit"]').click();
  await form.locator('[data-field="link-message"]').fill('Changed text');
  await form.locator('[data-action="submit"]').click();
  await until(() => sent.edit.length === 1, 'edited');
  assert(
    JSON.stringify(sent.edit[0]) ===
      JSON.stringify({ slug: 'abc', message: 'Changed text', title: 'Promo' }),
    `edited: ${JSON.stringify(sent.edit[0])}`
  );
  // Delete asks first.
  await row.locator('[data-action="link-delete"]').click();
  assert(sent.remove.length === 0, 'asked before deleting');
  await row.locator('[data-action="link-delete-cancel"]').click();
  assert(sent.remove.length === 0, 'cancel deletes nothing');
  await row.locator('[data-action="link-delete"]').click();
  await row.locator('[data-action="link-delete-confirm"]').click();
  await until(() => sent.remove.length === 1, 'deleted');
  assert(sent.remove[0].slug === 'abc', 'the slug');
  await gone(row, 'the row goes');
  await closeAll();
};

const botSteps = async () => {
  await openSection('bots');
  const dialog = page.locator('[data-dialog="business-bot"]');
  await dialog.waitFor({ timeout: 5000 });
  const name = dialog.locator('[data-field="bot-username"]');
  assert((await name.inputValue()) === 'shop_bot', 'the connected bot');
  assert((await text(dialog)).includes('Shop Bot'), 'its name');
  assert(
    (await dialog
      .locator('[data-field="recipient-existingChats"]')
      .isChecked()) === true,
    'existing chats'
  );
  await name.fill('x');
  await dialog.locator('[data-action="submit"]').click();
  await dialog.locator('[role="alert"]').waitFor();
  assert(sent.bot.length === 0, 'a bad name is not sent');
  await name.fill('@shop_bot');
  await dialog.locator('[data-field="bot-can-reply"]').uncheck();
  await dialog.locator('[data-field="recipient-newChats"]').check();
  await dialog.locator('[data-field="recipient-existingChats"]').uncheck();
  await dialog.locator('[data-action="submit"]').click();
  await until(() => sent.bot.length === 1, 'saved');
  assert(
    JSON.stringify(sent.bot[0]) ===
      JSON.stringify({
        username: 'shop_bot',
        recipients: {
          existingChats: false,
          newChats: true,
          contacts: false,
          nonContacts: false,
        },
        canReply: false,
      }),
    `the bot: ${JSON.stringify(sent.bot[0])}`
  );
  await gone(dialog, 'closes once saved');
  // Disconnect asks first.
  await openSection('bots');
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('[data-action="bot-disconnect"]').click();
  assert(sent.disconnect.length === 0, 'asked before disconnecting');
  await dialog.locator('[data-action="bot-disconnect-confirm"]').click();
  await until(() => sent.disconnect.length === 1, 'disconnected');
  await gone(dialog, 'closes once disconnected');
  await closeAll();
};

const profileSteps = async () => {
  await page.locator(`[data-chat="telegram:${SHOP}"]`).click();
  await page.locator('[data-action="chat-about"]').click();
  const hours = page.locator('.person-panel [data-business="hours"]');
  await hours.waitFor({ timeout: 10_000 });
  assert(
    (await text(hours.locator('[data-field="open-state"]'))) === 'Open now',
    'open now'
  );
  assert(
    (await text(hours.locator('[data-field="today"]'))).includes('24 hours'),
    'today: 24 hours'
  );
  await hours.locator('[data-action="hours-toggle"]').click();
  assert(
    (await hours.locator('[data-field="week"] li').count()) >= 7,
    'the whole week'
  );
  const mine = await page.evaluate(
    () => new Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  if (mine !== 'Pacific/Kiritimati') {
    await hours.locator('[data-action="hours-zone"]').click();
    assert(
      (await text(hours.locator('[data-action="hours-zone"]'))).includes(
        'their'
      ),
      'the switch to their zone is offered'
    );
  }
  const place = page.locator('.person-panel [data-business="location"]');
  assert((await text(place)).includes('1 Market Street'), 'the address');
  assert(
    new URL(await place.getAttribute('href')).hostname ===
      'www.openstreetmap.org',
    'the map link'
  );
  // A business that is closed.
  await page.locator(`[data-chat="telegram:${NIGHT}"]`).click();
  const night = page.locator('.person-panel [data-business="hours"]');
  await until(
    async () =>
      (await night.locator('[data-field="open-state"]').count()) === 1 &&
      (await text(night.locator('[data-field="open-state"]'))) === 'Closed',
    'closed'
  );
};

const barSteps = async () => {
  await page.locator(`[data-chat="telegram:${NIGHT}"]`).click();
  const bar = page.locator(`[data-business-bot="${NIGHT}"]`);
  await bar.waitFor({ timeout: 10_000 });
  assert((await text(bar)).includes('Shop Bot manages this chat'), 'the bar');
  await bar.locator('[data-action="bot-bar-pause"]').click();
  await until(() => sent.pause.length === 1, 'paused');
  assert(
    JSON.stringify(sent.pause[0]) ===
      JSON.stringify({ chat: NIGHT, paused: true }),
    'pause sent'
  );
  await bar.locator('[data-action="bot-bar-resume"]').waitFor();
  assert((await text(bar)).includes('paused'), 'says paused');
  await bar.locator('[data-action="bot-bar-resume"]').click();
  await until(() => sent.pause.length === 2, 'resumed');
  await bar.locator('[data-action="bot-bar-remove"]').click();
  assert(sent.disable.length === 0, 'asked before removing');
  await bar.locator('[data-action="bot-bar-remove-cancel"]').click();
  await bar.locator('[data-action="bot-bar-remove"]').click();
  await bar.locator('[data-action="bot-bar-remove-confirm"]').click();
  await until(() => sent.disable.length === 1, 'removed');
  await gone(bar, 'the bar goes');
  // A chat with no bot has no bar.
  await page.locator(`[data-chat="telegram:${SHOP}"]`).click();
  assert(
    (await page.locator('[data-business-bot]').count()) === 0,
    'no bar elsewhere'
  );
};

const introChatSteps = async () => {
  await page.goto(`${base}/#chat=telegram:${EMPTY}`);
  const intro = page.locator('[data-business="intro"]');
  await intro.waitFor({ timeout: 10_000 });
  const shown = await text(intro);
  assert(
    shown.includes('Welcome!') && shown.includes('Ask me anything'),
    `the intro: ${shown}`
  );
};

const linkOpenSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${FRIEND}"]`).click();
  const link = page.locator('a.msg-link[href="https://t.me/m/Promo1"]');
  await link.waitFor({ timeout: 10_000 });
  const box = page.locator('.chat-composer textarea');
  await link.click();
  await until(async () => (await box.inputValue()) === LINK_TEXT, 'the text');
  assert(sent.resolve[0].slug === 'Promo1', 'resolved by its slug');
  assert(
    (await page.locator(`[data-chat="telegram:${SHOP}"].active`).count()) === 1,
    "the owner's chat is open"
  );
  assert(
    (await page.locator('.bubble', { hasText: LINK_TEXT }).count()) === 0,
    'the text is in the box, not sent'
  );
};

const tagSteps = async () => {
  await page.goto(`${base}/`);
  const row = page.locator(`[data-chat="telegram:${SHOP}"]`);
  await row.locator('[data-folder-tag="2"]').waitFor({ timeout: 10_000 });
  assert(
    (await text(row.locator('[data-folder-tag="2"]'))) === 'Work',
    'the tag has the folder name'
  );
  assert(
    (await page
      .locator(`[data-chat="telegram:${NIGHT}"] [data-folder-tag]`)
      .count()) === 0,
    'a chat outside the folder has none'
  );
  // The open folder's own chats carry no tag.
  await page.locator('.chat-filter[data-filter="folder:2"]').click();
  await until(
    async () => (await row.locator('[data-folder-tag]').count()) === 0,
    'no tag inside its own folder'
  );
  await page.locator('.chat-filter[data-filter="all"]').click();
  // The switch: refused without Premium, then on its way off.
  await toSettings();
  const toggle = page.locator('[data-field="folder-tags"]');
  await toggle.waitFor({ timeout: 5000 });
  assert(await toggle.isChecked(), 'tags are on');
  assert(sent.tags.length === 0, 'nothing sent before a click');
  refused.premium = true;
  await toggle.click();
  await until(() => sent.tags.length === 1, 'asked');
  await page.locator('.folder-tags-toggle [role="alert"]').waitFor();
  assert(
    (await text(page.locator('.folder-tags-toggle'))).includes(
      'need Telegram Premium'
    ),
    'the refusal in words'
  );
  assert(await toggle.isChecked(), 'the switch stays');
  refused.premium = false;
  await toggle.click();
  await until(() => sent.tags.length === 2, 'asked again');
  await until(async () => !(await toggle.isChecked()), 'now off');
  assert(sent.tags[1].enabled === false, 'off sent');
  await toChats();
  await until(
    async () => (await row.locator('[data-folder-tag]').count()) === 0,
    'no tags once off'
  );
};

const colorSteps = async () => {
  await toSettings();
  await page.locator('[data-action="folder-create"]').click();
  const editor = page.locator('[data-dialog="folder-editor"]');
  await editor.waitFor({ timeout: 5000 });
  await editor.locator('[data-field="folder-title"]').fill('Tagged');
  await editor.locator('[data-section="include"] [data-kind="groups"]').check();
  await editor.locator('.folder-colors [data-color="5"]').click();
  assert(
    (await editor
      .locator('.folder-colors [data-color="5"]')
      .getAttribute('aria-pressed')) === 'true',
    'the colour is picked'
  );
  assert(sent.folder.length === 0, 'nothing sent before Save');
  await editor.locator('[data-action="submit"]').click();
  await until(() => sent.folder.length === 1, 'saved');
  assert(sent.folder[0].folder.color === 5, 'the colour sent');
  await gone(editor, 'closes once saved');
};

await finish(async () => {
  await hoursSteps();
  await placeSteps();
  await introSteps();
  await linkSteps();
  await botSteps();
  await toChats();
  await profileSteps();
  await barSteps();
  await introChatSteps();
  await linkOpenSteps();
  await tagSteps();
  await colorSteps();
});
