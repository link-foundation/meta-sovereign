// Real browser e2e for the sticker and emoji extras (R-Y206), as Telegram
// Desktop offers them: the Stickers tab's Trending list (new sets marked
// and read, Add, older ones on "Show more") and the emoji tab's trending
// custom emoji sets; in Settings → Stickers and emoji the sets (moved,
// archived), "Clear recent stickers" after a question and the quick
// reaction a double-click on a message then sends; ":word" in the message
// box suggesting emoji by Telegram's words, picked by Tab or a click.
// Telegram's answers faked in the page, a fake chat in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:sticker-extras

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '555';
const store = createMemoryStore();
await store.put({
  id: `msg:telegram:${CHAT}:1`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Dave',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Dave',
  body: 'look at this',
  timestamp: new Date(Date.now() - 60_000).toISOString(),
  raw: { id: 1 },
});

// A photo with stickers on it.
await store.put({
  id: `msg:telegram:${CHAT}:2`,
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Dave',
  chatType: 'user',
  sender: CHAT,
  senderName: 'Fake Dave',
  body: '📎',
  timestamp: new Date(Date.now() - 30_000).toISOString(),
  raw: {
    id: 2,
    media: {
      className: 'MessageMediaPhoto',
      photo: {
        className: 'Photo',
        id: '9',
        hasStickers: true,
        sizes: [{ className: 'PhotoSize', type: 'm', w: 320, h: 240, size: 1 }],
      },
    },
  },
});

const { base, page, until, finish } = await openChatApp('sticker-extras', {
  store,
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const sticker = (id) => ({
  id: String(id),
  kind: 'sticker',
  format: 'webp',
  emoji: '😀',
  w: 512,
  h: 512,
});
const set = (id, title, extra = {}) => ({
  id,
  title,
  count: 5,
  format: 'webp',
  emoji: false,
  official: false,
  installed: false,
  unread: false,
  ...extra,
});

// What the fake account keeps and was asked.
const fake = {
  mine: [set('1', 'Cats', { installed: true }), set('2', 'Dogs')],
  featured: [
    set('101', 'Old Favourites'),
    set('102', 'Fresh Pack', { unread: true }),
  ],
  older: [set('103', 'Ancient Pack')],
  featuredEmoji: [set('201', 'Party Emoji', { emoji: true })],
  quick: '❤️',
  asked: [],
};
const sentLast = (name) => fake.asked.filter(([n]) => n === name).at(-1)?.[1];
const count = (name) => fake.asked.filter(([n]) => n === name).length;

await page.route('**/api/telegram/sticker?*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
await page.route('**/api/telegram/media?*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: '',
    about: '',
    username: 'ann',
    phone: '',
    hasPhoto: false,
    aboutMax: 70,
  })
);
const post = (name, handler) =>
  page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON() ?? {};
    fake.asked.push([name, body]);
    return fulfil(route, handler(body));
  });
await post('stickers', () => ({
  ok: true,
  faved: [],
  recent: [sticker(900)],
  sets: fake.mine.map(({ id, title, count: n, format, emoji }) => ({
    id,
    title,
    count: n,
    format,
    emoji,
  })),
}));
await post('sticker-set', (body) => ({
  ok: true,
  id: body.id,
  stickers: [sticker(Number(body.id) * 10), sticker(Number(body.id) * 10 + 1)],
}));
await post('gifs', () => ({ ok: true, gifs: [] }));
await post('sticker-featured', (body) => {
  if (body.emojis) {
    return {
      ok: true,
      count: 1,
      sets: fake.featuredEmoji,
      unread: [],
      next: null,
    };
  }
  if (body.old) {
    return { ok: true, count: 3, sets: fake.older, unread: [], next: null };
  }
  return {
    ok: true,
    count: 3,
    sets: fake.featured,
    unread: fake.featured.filter((s) => s.unread).map((s) => s.id),
    next: null,
  };
});
await post('sticker-featured-read', () => ({ ok: true }));
await post('sticker-set-install', (body) => ({
  ok: true,
  id: body.id,
  installed: body.install,
}));
await post('sticker-sets', () => ({ ok: true, sets: [...fake.mine] }));
await post('sticker-sets-reorder', (body) => {
  fake.mine = body.ids.map((id) => fake.mine.find((s) => s.id === id));
  return { ok: true };
});
await post('sticker-set-archive', (body) => {
  fake.mine = fake.mine.filter((s) => s.id !== body.id);
  return { ok: true, id: body.id };
});
await post('sticker-recent-clear', () => ({ ok: true }));
await post('available-reactions', () => ({
  ok: true,
  reactions: ['👍', '❤️', '🔥', '🎉'].map((emoji) => ({
    emoji,
    title: emoji,
    premium: false,
  })),
}));
await post('quick-reaction', () => ({ ok: true, emoji: fake.quick }));
await post('quick-reaction-set', (body) => {
  fake.quick = body.emoji;
  return { ok: true, emoji: body.emoji };
});
await post('emoji-keywords', () => ({
  ok: true,
  lang: 'en',
  version: 1,
  keywords: { cat: ['🐈', '🐱'], carrot: ['🥕'], happy: ['😀'] },
}));
await post('sticker-attached', (body) => ({
  ok: true,
  sets:
    body.id === '2'
      ? [set('301', 'Heart Stickers'), set('302', 'Star Stickers')]
      : [],
}));
await post('sticker-set-box', (body) => ({
  ok: true,
  set: set(body.id, body.id === '301' ? 'Heart Stickers' : 'Star Stickers', {
    installed: false,
  }),
  items: [sticker(3010), sticker(3011)],
}));
const reacted = [];
await page.route('**/api/message/react', (route) => {
  reacted.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

const panel = page.locator('.emoji-panel');
const box = () => page.locator('.chat-composer textarea');

const openChat = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await box().waitFor({ timeout: 15000 });
};

const openStickers = async () => {
  await page.locator('[data-action="emoji"]').click();
  await panel.waitFor({ timeout: 5000 });
  await panel.locator('[data-tab="stickers"]').click();
};

const trendingSteps = async () => {
  await openStickers();
  await panel.locator('[data-category="set:1"]').waitFor({ timeout: 5000 });
  assert(count('sticker-featured') === 0, 'trending not asked before opening');
  await panel.locator('[data-action="sticker-trending"]').click();
  const list = panel.locator('[data-trending="stickers"]');
  await list.waitFor({ timeout: 5000 });
  await list.locator('[data-category="set:102"]').waitFor({ timeout: 5000 });
  const fresh = await list.locator('[data-category="set:102"]').textContent();
  assert(
    fresh.includes('Fresh Pack') && fresh.includes('NEW'),
    `new: ${fresh}`
  );
  assert(
    !(await list.locator('[data-category="set:101"]').textContent()).includes(
      'NEW'
    ),
    'only the new set is marked'
  );
  await until(
    async () => Boolean(sentLast('sticker-featured-read')),
    'the new set read'
  );
  assert(
    JSON.stringify(sentLast('sticker-featured-read')) === '{"ids":["102"]}',
    `read: ${JSON.stringify(sentLast('sticker-featured-read'))}`
  );
  // Add installs it and the button goes.
  await list.locator('[data-add-set="102"]').click();
  await until(
    async () => (await list.locator('[data-add-set="102"]').count()) === 0,
    'Add gone once added'
  );
  assert(
    JSON.stringify(sentLast('sticker-set-install')) ===
      '{"id":"102","install":true}',
    `install: ${JSON.stringify(sentLast('sticker-set-install'))}`
  );
  // Older sets on "Show more", once.
  await list.locator('[data-action="trending-more"]').click();
  await list.locator('[data-category="set:103"]').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(sentLast('sticker-featured')) ===
      '{"emojis":false,"old":true,"offset":0}' ||
      sentLast('sticker-featured').old === true,
    `older asked: ${JSON.stringify(sentLast('sticker-featured'))}`
  );
  await until(
    async () =>
      (await list.locator('[data-action="trending-more"]').count()) === 0,
    'no more pages'
  );
  await panel.locator('[data-action="trending-back"]').click();
  await panel.locator('[data-category="set:1"]').waitFor({ timeout: 5000 });
};

const trendingEmojiSteps = async () => {
  await panel.locator('[data-tab="emoji"]').click();
  await panel.locator('[data-action="emoji-trending"]').click();
  const row = panel.locator('[data-trending-set="201"]');
  await row.waitFor({ timeout: 5000 });
  assert(
    (await row.textContent()).includes('Party Emoji'),
    'trending emoji set'
  );
  await row.locator('[data-add-set="201"]').click();
  await until(
    async () => (await row.locator('[data-add-set="201"]').count()) === 0,
    'emoji set added'
  );
  assert(sentLast('sticker-set-install').id === '201', 'emoji set installed');
  await panel.locator('[data-action="trending-back"]').click();
  await panel.locator('input.emoji-search').waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await until(async () => (await panel.count()) === 0, 'panel closed');
};

const settingsSteps = async () => {
  const dialog = page.locator('[data-dialog="sticker-settings"]');
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-sticker-settings"]').click();
  await dialog.locator('[data-set="1"]').waitFor({ timeout: 5000 });
  // A set moves and another is archived.
  await dialog.locator('[data-set="1"] [data-action="set-down"]').click();
  await until(
    async () =>
      JSON.stringify(sentLast('sticker-sets-reorder')) ===
      '{"ids":["2","1"],"emojis":false}',
    'reorder sent'
  );
  await dialog.locator('[data-set="2"] [data-action="set-archive"]').click();
  await until(
    async () => (await dialog.locator('[data-set="2"]').count()) === 0,
    'archived set leaves the list'
  );
  // Clear recent stickers: only after the question.
  await dialog.locator('[data-action="clear-recent"]').click();
  await dialog.locator('[data-action="cancel-clear-recent"]').click();
  assert(
    count('sticker-recent-clear') === 0,
    'nothing cleared before the answer'
  );
  await dialog.locator('[data-action="clear-recent"]').click();
  await dialog.locator('[data-action="confirm-clear-recent"]').click();
  await dialog.locator('[data-done="clear-recent"]').waitFor({ timeout: 5000 });
  assert(count('sticker-recent-clear') === 1, 'recent stickers cleared once');
  // The quick reaction: the account's is marked; another is chosen.
  const quick = (emoji) => dialog.locator(`[data-quick-reaction="${emoji}"]`);
  await quick('🔥').waitFor({ timeout: 5000 });
  assert(
    (await quick('❤️').getAttribute('aria-pressed')) === 'true',
    'the account quick reaction is marked'
  );
  await quick('🔥').click();
  await until(
    async () => (await quick('🔥').getAttribute('aria-pressed')) === 'true',
    'new quick reaction marked'
  );
  assert(sentLast('quick-reaction-set').emoji === '🔥', 'quick reaction sent');
  await page.keyboard.press('Escape');
  await until(async () => (await dialog.count()) === 0, 'settings closed');
  await page.keyboard.press('Escape');
};

const doubleClickSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await box().waitFor({ timeout: 15000 });
  const bubble = page.locator(`[data-message="msg:telegram:${CHAT}:1"]`);
  await bubble.waitFor({ timeout: 5000 });
  // The page asks the account for it once; the new choice is used.
  await until(async () => count('quick-reaction') >= 1, 'quick reaction asked');
  await page.waitForTimeout(200);
  await bubble.dblclick();
  await until(async () => reacted.length === 1, 'double-click reacts');
  assert(reacted[0].emoji === '🔥', `reacted: ${JSON.stringify(reacted)}`);
  assert(
    (await box().inputValue()) === '',
    'a double-click reacts, it does not start a reply'
  );
};

const colonSteps = async () => {
  const strip = page.locator('.emoji-suggest');
  await box().click();
  await page.keyboard.type('say :ca');
  await strip.waitFor({ timeout: 5000 });
  // The strip appears at ":c" and narrows as the next keys land; read it
  // only once ":ca" has settled (the cat comes first), not mid-typing.
  const read = () =>
    strip
      .locator('[data-emoji-suggest]')
      .evaluateAll((all) => all.map((b) => b.dataset.emojiSuggest));
  await until(async () => (await read())[0] === '🐈', 'ca suggestions settled');
  const items = await read();
  assert(items[0] === '🐈' && items.includes('🐱'), `suggested: ${items}`);
  assert(items.includes('🥕'), 'the words it begins');
  // Tab puts the first in place of ":ca".
  await page.keyboard.press('Tab');
  await until(
    async () => (await box().inputValue()) === 'say 🐈',
    'picked by Tab'
  );
  await until(
    async () => (await strip.count()) === 0,
    'strip gone after a pick'
  );
  // A click on another; Escape closes without picking.
  await page.keyboard.type(' :ca');
  await strip.waitFor({ timeout: 5000 });
  await strip.locator('[data-emoji-suggest="🐱"]').click();
  await until(
    async () => (await box().inputValue()) === 'say 🐈 🐱',
    'picked by a click'
  );
  await page.keyboard.type(' :hap');
  await strip.waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await until(
    async () => (await strip.count()) === 0,
    'Escape closes the strip'
  );
  assert(
    (await box().inputValue()) === 'say 🐈 🐱 :hap',
    'Escape leaves the text'
  );
  // A time is no emoji word.
  await box().fill('at 12:30');
  await page.waitForTimeout(300);
  assert((await strip.count()) === 0, 'no strip for a time');
};

const attachedSteps = async () => {
  await page.locator('.bubble-photo').click();
  await page.locator('.photo-viewer').waitFor({ timeout: 5000 });
  // The viewer's menu has the item for a photo with stickers.
  await page.locator('[data-action="viewer-menu"]').click();
  await page.locator('[data-action="attached-stickers"]').click();
  const row = (id) => page.locator(`[data-attached-set="${id}"]`);
  await row('301').waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(sentLast('sticker-attached')) ===
      `{"chat":"${CHAT}","id":"2"}`,
    `asked: ${JSON.stringify(sentLast('sticker-attached'))}`
  );
  assert(
    (await row('302').textContent()).includes('Star Stickers'),
    'both sets'
  );
  // A set opens its box, with Add; Escape goes back, then closes the
  // dialog without closing the viewer.
  await row('302').click();
  await page.locator('[data-action="box-add"]').waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await row('301').waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await until(async () => (await row('301').count()) === 0, 'dialog closed');
  assert(
    (await page.locator('.photo-viewer').count()) === 1,
    'the viewer stays when the dialog closes'
  );
  await page.keyboard.press('Escape');
  await until(
    async () => (await page.locator('.photo-viewer').count()) === 0,
    'the viewer closes'
  );
};

await finish(async () => {
  await openChat();
  await trendingSteps();
  await trendingEmojiSteps();
  await settingsSteps();
  await doubleClickSteps();
  await colonSteps();
  await attachedSteps();
});
