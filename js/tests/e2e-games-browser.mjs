// Real browser e2e for HTML5 bot games (R-Y190), as Telegram Desktop shows
// them: a game message is a card (picture, title, description) under its
// text; the bot's "Play" button asks the bot and the game's address opens
// in a new tab after asking; a game without the button has "Play" in the
// card; "High scores" in the menu lists position, name and score; a score
// service message reads "Ann scored 120 in Lumberjack"; an address that is
// not a web link is never opened. Telegram's answers faked in the page,
// window.open recorded (nothing navigates), a fake chat in a memory store,
// a server on a free port, a headless browser; nothing reaches a network
// or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:games

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '777';
const linkOf = (n) => `msg:telegram:${CHAT}:${n}`;
const start = Date.now() - 10 * 60_000;
const message = (n, fields) => ({
  id: linkOf(n),
  source: 'telegram',
  chat: CHAT,
  chatName: 'Fake Game Bot',
  chatType: 'personal_chat',
  sender: CHAT,
  senderName: 'Fake Game Bot',
  timestamp: new Date(start + n * 60_000).toISOString(),
  body: '',
  ...fields,
  raw: { id: n, ...fields.raw },
});
const game = (title, description) => ({
  className: 'MessageMediaGame',
  game: {
    shortName: 'lumber',
    title,
    description,
    photo: {
      id: 5n.toString(),
      sizes: [{ className: 'PhotoSize', type: 'm', w: 320, h: 160, size: 900 }],
    },
  },
});
const store = createMemoryStore();
await store.put(
  message(1, {
    body: 'Try the new game!',
    raw: {
      media: game('Lumberjack', 'Chop the tree, dodge the branches.'),
      replyMarkup: {
        className: 'ReplyInlineMarkup',
        rows: [
          {
            className: 'KeyboardButtonRow',
            buttons: [
              { className: 'KeyboardButtonGame', text: 'Play Lumberjack' },
            ],
          },
        ],
      },
    },
  })
);
await store.put(
  message(2, {
    body: '',
    raw: { media: game('Forwarded Game', 'Came without a button.') },
  })
);
await store.put(
  message(3, {
    sender: '31',
    senderName: 'Ann',
    service: 'MessageActionGameScore',
    raw: {
      action: { className: 'MessageActionGameScore', gameId: '9', score: 120 },
      replyTo: { replyToMsgId: 1 },
    },
  })
);

const { base, page, until, finish } = await openChatApp('games', { store });

// What the page opens, kept in the page; nothing navigates.
await page.addInitScript(() => {
  globalThis.__opened = [];
  globalThis.open = (...args) => {
    globalThis.__opened.push(args);
    return null;
  };
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: true, complete: true, newest: false })
);
await page.route('**/api/telegram/chat-info*', (route) =>
  fulfil(route, {
    chat: CHAT,
    kind: 'user',
    title: 'Fake Game Bot',
    username: 'gamebot',
    bot: true,
  })
);
const pressed = [];
await page.route('**/api/telegram/bot-callback', (route) => {
  const body = route.request().postDataJSON();
  pressed.push(body);
  return fulfil(route, {
    ok: true,
    message: null,
    alert: false,
    url:
      body.id === 1
        ? 'https://games.example.org/lumberjack?tg=1'
        : 'javascript:alert(1)',
  });
});
const asked = [];
await page.route('**/api/telegram/game-scores', (route) => {
  asked.push(route.request().postDataJSON());
  return fulfil(route, {
    ok: true,
    scores: [
      { pos: 1, user: '31', name: 'Ann Fake', score: 900, me: false },
      { pos: 2, user: '32', name: 'Bob Fake', score: 450, me: true },
    ],
  });
});

const row = (n) => page.locator(`.chat-scroll [data-message="${linkOf(n)}"]`);
const opened = () => page.evaluate(() => globalThis.__opened);

await finish(async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  await row(1).waitFor({ timeout: 15000 });

  // The card: the text above, then title and description.
  const card = row(1).locator('[data-game]');
  await card.waitFor({ timeout: 5000 });
  const text = await row(1).textContent();
  assert(text.includes('Try the new game!'), `text: ${text}`);
  assert(
    text.indexOf('Try the new game!') < text.indexOf('Lumberjack'),
    'above'
  );
  assert((await card.textContent()).includes('Chop the tree'), 'description');
  assert(
    (await card.locator('[data-action="game-play"]').count()) === 0,
    'bot button only'
  );

  // Play: the bot is asked with `game`, the address opens after asking.
  await page
    .locator(`[data-bot-keyboard="${linkOf(1)}"] [data-bot-button="game"]`)
    .click();
  await page.locator('[data-bot-dialog="url"]').waitFor({ timeout: 5000 });
  assert((await opened()).length === 0, 'nothing opened before confirming');
  await page.locator('[data-action="bot-open"]').click();
  await until(async () => (await opened()).length === 1, 'opened');
  assert(
    JSON.stringify((await opened())[0]) ===
      '["https://games.example.org/lumberjack?tg=1","_blank","noopener,noreferrer"]',
    `open: ${JSON.stringify(await opened())}`
  );
  assert(
    JSON.stringify(pressed[0]) === `{"chat":"${CHAT}","id":1,"game":true}`,
    `asked: ${JSON.stringify(pressed[0])}`
  );

  // A game without the button plays from the card; a bad address never opens.
  const own = row(2).locator('[data-action="game-play"]');
  await own.click();
  await until(async () => pressed.length === 2, 'asked again');
  assert(pressed[1].id === 2 && pressed[1].game === true, 'own id');
  await page.waitForTimeout(300);
  assert(
    (await page.locator('[data-bot-dialog="url"]').count()) === 0,
    'no dialog'
  );
  assert((await opened()).length === 1, 'javascript: address not opened');

  // High scores from the menu.
  await row(1)
    .locator('.bubble-body, .bubble')
    .first()
    .click({ button: 'right' });
  await page.locator('.msg-context-menu').waitFor({ timeout: 5000 });
  const item = page.locator('.msg-context-menu [data-action="gameScores"]');
  assert((await item.textContent()).includes('High scores'), 'menu item');
  await item.click();
  const panel = page.locator('[data-dialog="game-scores"]');
  await panel.locator('[data-score="1"]').waitFor({ timeout: 5000 });
  const scores = await panel.textContent();
  assert(
    scores.includes('Ann Fake') && scores.includes('900'),
    `first: ${scores}`
  );
  assert(scores.includes('Bob Fake') && scores.includes('450'), 'second');
  assert((await panel.locator('[data-score]').count()) === 2, 'two rows');
  assert(
    JSON.stringify(asked[0]) === `{"chat":"${CHAT}","id":1}`,
    'scores asked'
  );
  await panel.locator('[data-action="close"]').click();
  await until(async () => (await panel.count()) === 0, 'closed');

  // The score service message.
  const line = page.locator(`.service-line[data-message="${linkOf(3)}"]`);
  await line.waitFor({ timeout: 5000 });
  const said = (await line.textContent()).trim();
  assert(said === 'Ann scored 120 in Lumberjack', `service: ${said}`);
});
