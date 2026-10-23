// Real browser e2e for service messages (R-Y221), as Telegram Desktop shows
// them: in a group, a channel and a private chat, the line names the actor
// and the people ("Ann was accepted into the group", "You invited Ann Fake,
// Bob Fake to the group call"), a new group photo is a small round picture
// that opens, an empty action is hidden, an action from the future still
// reads "Service message"; and the newer entities (bank card, formatted
// date, diff marks) and cards (live stream, sticker-set link preview) draw.
// Telegram's answers faked in the page, a fake chat in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or a
// running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:service-messages

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const GROUP = '701';
const CHANNEL = '702';
const PRIVATE = '703';
const start = Date.now() - 60 * 60_000;
let tick = 0;
const message = (chat, fields) => {
  tick += 1;
  const { raw = {}, ...rest } = fields;
  const type = { [GROUP]: 'group', [CHANNEL]: 'channel' }[chat];
  return {
    id: `msg:telegram:${chat}:${tick}`,
    source: 'telegram',
    chat,
    chatName:
      { [GROUP]: 'Fake Group', [CHANNEL]: 'Fake Channel' }[chat] ?? 'Dan',
    chatType: type ?? 'personal_chat',
    sender: '31',
    senderName: 'Ann',
    timestamp: new Date(start + tick * 60_000).toISOString(),
    body: '',
    ...rest,
    raw: { id: tick, ...raw },
  };
};
const service = (chat, className, action = {}, fields = {}) =>
  message(chat, {
    service: className,
    ...fields,
    raw: { action: { className, ...action }, ...fields.raw },
  });
const photo = {
  className: 'Photo',
  id: '5',
  sizes: [{ className: 'PhotoSize', type: 'm', w: 320, h: 320, size: 900 }],
};
const names = {
  31: { name: 'Ann Fake', self: false },
  32: { name: 'Bob Fake', self: false },
};

const list = [
  service(GROUP, 'MessageActionChatJoinedByRequest'),
  service(GROUP, 'MessageActionChatEditPhoto', { photo }),
  service(
    GROUP,
    'MessageActionInviteToGroupCall',
    { users: ['31', '32'] },
    { sender: 'me', senderName: null, raw: { actionNames: names } }
  ),
  service(GROUP, 'MessageActionBoostApply', { boosts: 2 }),
  service(
    GROUP,
    'MessageActionNewCreatorPending',
    { newCreatorId: '32' },
    {
      raw: { actionNames: names },
    }
  ),
  service(GROUP, 'MessageActionEmpty'),
  service(GROUP, 'MessageActionFutureThing'),
  message(GROUP, {
    body: 'card 4111111111111111 at noon, old new gone',
    raw: {
      entities: [
        { className: 'MessageEntityBankCard', offset: 5, length: 16 },
        {
          className: 'MessageEntityFormattedDate',
          offset: 25,
          length: 4,
          date: 1900000000,
          longDate: true,
        },
        {
          className: 'MessageEntityDiffReplace',
          offset: 31,
          length: 3,
          oldText: 'older',
        },
        { className: 'MessageEntityDiffInsert', offset: 35, length: 3 },
        { className: 'MessageEntityDiffDelete', offset: 39, length: 4 },
      ],
    },
  }),
  service(
    CHANNEL,
    'MessageActionChatEditPhoto',
    { photo },
    { senderName: 'Fake Channel' }
  ),
  service(
    CHANNEL,
    'MessageActionChatDeletePhoto',
    {},
    { senderName: 'Fake Channel' }
  ),
  service(
    PRIVATE,
    'MessageActionSetMessagesTTL',
    { period: 86400 },
    { sender: 'me', senderName: null }
  ),
  service(
    PRIVATE,
    'MessageActionScreenshotTaken',
    {},
    { sender: PRIVATE, senderName: 'Dan' }
  ),
  service(
    PRIVATE,
    'MessageActionSuggestProfilePhoto',
    { photo },
    { sender: PRIVATE, senderName: 'Dan' }
  ),
  service(
    PRIVATE,
    'MessageActionGiftStars',
    { stars: 100, currency: 'USD', amount: 199 },
    { sender: PRIVATE, senderName: 'Dan' }
  ),
  message(PRIVATE, {
    sender: PRIVATE,
    senderName: 'Dan',
    body: 'Live now',
    raw: { media: { className: 'MessageMediaVideoStream', rtmpStream: false } },
  }),
  message(PRIVATE, {
    sender: PRIVATE,
    senderName: 'Dan',
    body: 'https://t.me/addstickers/cats',
    raw: {
      media: {
        className: 'MessageMediaWebPage',
        webpage: {
          url: 'https://t.me/addstickers/cats',
          title: 'Cats',
          attributes: [{ className: 'WebPageAttributeStickerSet' }],
        },
      },
    },
  }),
];
const store = createMemoryStore();
for (const link of list) {
  await store.put(link);
}
const at = (chat, n) => `msg:telegram:${chat}:${n}`;

const { base, page, until, finish } = await openChatApp('service-messages', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: true, complete: true, newest: false })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, { chat: GROUP, kind: 'user', title: 'Chat' })
);
await page.route('**/api/telegram/media?*', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
);

const row = (id) => page.locator(`.chat-scroll [data-message="${id}"]`);
const textOf = async (id) => {
  await row(id).waitFor({ timeout: 15000 });
  return (await row(id).textContent()).trim();
};
const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
};
const expectText = async (id, want) => {
  const got = await textOf(id);
  assert(got.includes(want), `want "${want}", got "${got}"`);
};

await finish(async () => {
  await page.goto(`${base}/`);

  // A group: names, "You", the round photo, hidden and unknown actions.
  await open(GROUP);
  await expectText(at(GROUP, 1), 'Ann was accepted into the group');
  await expectText(at(GROUP, 2), 'Ann changed the group photo');
  await expectText(
    at(GROUP, 3),
    'You invited Ann Fake, Bob Fake to the group call'
  );
  await expectText(at(GROUP, 4), 'Ann boosted this chat 2 times');
  await expectText(
    at(GROUP, 5),
    'Bob Fake will become the owner of this chat once the transfer is complete'
  );
  await expectText(at(GROUP, 7), 'Service message');
  assert((await row(at(GROUP, 6)).count()) === 0, 'an empty action is hidden');

  const round = row(at(GROUP, 2)).locator('[data-service-photo]');
  await round.waitFor({ timeout: 5000 });
  await round.locator('img').waitFor({ timeout: 5000 });
  await round.click();
  await page.locator('.photo-viewer').waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await until(
    async () => (await page.locator('.photo-viewer').count()) === 0,
    'viewer closes'
  );

  // The text's newer entities.
  const body = row(at(GROUP, 8));
  await body.locator('[data-bankcard="copy"]').waitFor({ timeout: 5000 });
  assert(
    (await body.locator('.msg-date').textContent()).includes('2030'),
    'formatted date in the viewer locale'
  );
  assert((await body.locator('.msg-diff-replace').count()) === 1, 'replace');
  assert((await body.locator('.msg-diff-insert').count()) === 1, 'insert');
  assert((await body.locator('.msg-diff-delete').count()) === 1, 'delete');

  // A channel: no actor, the channel's own words.
  await open(CHANNEL);
  await expectText(at(CHANNEL, 9), 'Channel photo updated');
  await expectText(at(CHANNEL, 10), 'Channel photo removed');

  // A private chat: "You", the other side, a suggestion with "View".
  await open(PRIVATE);
  await expectText(at(PRIVATE, 11), 'You set messages to auto-delete in 1 day');
  await expectText(at(PRIVATE, 12), 'Dan took a screenshot!');
  await expectText(
    at(PRIVATE, 13),
    'Dan suggests you to use this photo as your profile photo'
  );
  await row(at(PRIVATE, 13))
    .locator('[data-action="service-photo-view"]')
    .click();
  await page.locator('.photo-viewer').waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await expectText(at(PRIVATE, 14), 'Dan sent you a gift: 100 ⭐');
  await row(at(PRIVATE, 15))
    .locator('[data-live-stream]')
    .waitFor({ timeout: 5000 });
  assert(
    (await textOf(at(PRIVATE, 15))).includes('Live stream'),
    'live stream'
  );
  const kind = row(at(PRIVATE, 16)).locator('[data-wp-kind="stickerSet"]');
  await kind.waitFor({ timeout: 5000 });
  assert((await kind.textContent()) === 'Sticker set', 'preview kind');
});
