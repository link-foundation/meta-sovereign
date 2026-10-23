// Real browser e2e for a bot's commands (R-Y135), as Telegram Desktop
// offers them: "/" at the start of the box lists the bot's commands
// (/command in bold, its description), the list narrows as one types, Up
// and Down move, Tab puts the command in the box, Enter sends it, Escape
// closes; in a group each command names its bot and is completed as
// /command@botusername; a bot chat has a Menu button opening the same
// list, or, for a web-app menu, a button opening its mini app. Telegram's
// answers faked in the page, fake chats in a memory store, a fake sender
// that records, a server on a free port, a headless browser; nothing
// reaches a network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:bot-commands

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const BOT = '7';
const GROUP = '-5';
const WEBAPP = '8';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (100 - n)).toISOString();
const message = (chat, name, type, sender) => ({
  id: `msg:telegram:${chat}:1`,
  source: 'telegram',
  chat,
  chatName: name,
  chatType: type,
  sender,
  senderName: name,
  body: 'hello there',
  timestamp: at(1),
  raw: { id: 1 },
});
await store.put(message(BOT, 'Fake Pizza Bot', 'user', BOT));
await store.put(message(WEBAPP, 'Fake App Bot', 'user', WEBAPP));
await store.put(message(GROUP, 'Fake Group', 'group', '31'));

const sent = [];
const { base, page, until, finish } = await openChatApp('bot-commands', {
  store,
  send: async (draft) => {
    sent.push(draft);
    return { via: 'fake' };
  },
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = String(route.request().postDataJSON()?.chat ?? '');
  return fulfil(
    route,
    chat === GROUP
      ? { chat, kind: 'group', title: 'Fake Group' }
      : { chat, kind: 'user', title: 'Fake Bot', bot: true }
  );
});
const asked = [];
const cmd = (command, description, bot, botName, username) => ({
  command,
  description,
  bot,
  botName,
  username,
});
await page.route('**/api/telegram/bot-commands', (route) => {
  const { chat } = route.request().postDataJSON();
  asked.push(chat);
  if (chat === GROUP) {
    return fulfil(route, {
      ok: true,
      commands: [
        cmd('start', 'Begin', '71', 'Pizza', 'pizza_bot'),
        cmd('stop', 'End it', '72', 'Taxi', 'taxi_bot'),
        cmd('order', 'Order a ride', '72', 'Taxi', 'taxi_bot'),
      ],
      menu: { kind: 'default' },
    });
  }
  if (chat === WEBAPP) {
    return fulfil(route, {
      ok: true,
      commands: [cmd('start', 'Begin', WEBAPP, 'App', 'app_bot')],
      menu: { kind: 'webapp', text: 'Open app', url: 'https://app.test/x' },
    });
  }
  return fulfil(route, {
    ok: true,
    commands: [
      cmd('start', 'Begin', BOT, 'Pizza', 'pizza_bot'),
      cmd('status', 'Order status', BOT, 'Pizza', 'pizza_bot'),
      cmd('help', 'Show help', BOT, 'Pizza', 'pizza_bot'),
    ],
    menu: { kind: 'commands' },
  });
});

const list = page.locator('.bot-commands');
const box = page.locator('.chat-composer textarea');
const options = () => list.locator('[role="option"]');
const names = async () =>
  options().evaluateAll((o) => o.map((x) => x.dataset.command));
const selected = async () =>
  list.locator('[aria-selected="true"]').getAttribute('data-command');
const open = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await box.waitFor({ timeout: 15000 });
};
const textOf = (draft) => draft.text ?? draft.body;

const botChat = async () => {
  await page.goto(`${base}/`);

  // A bot chat: "/" lists the commands, bold with the description.
  await open(BOT);
  await page.locator('[data-action="bot-menu"]').waitFor({ timeout: 5000 });
  assert((await list.count()) === 0, 'closed before typing');
  await box.click();
  await box.pressSequentially('/');
  await options().first().waitFor({ timeout: 5000 });
  assert(
    JSON.stringify(await names()) === '["start","status","help"]',
    `all: ${JSON.stringify(await names())}`
  );
  const first = options().first();
  assert((await first.locator('b').textContent()) === '/start', 'bold command');
  assert((await first.textContent()).includes('Begin'), 'description');
  assert(
    !(await list.textContent()).includes('Pizza'),
    'no bot name in a bot chat'
  );

  // It narrows as one types.
  await box.pressSequentially('st');
  await until(async () => (await options().count()) === 2, 'narrowed');
  await box.press('Backspace');
  await box.press('Backspace');
  await until(async () => (await options().count()) === 3, 'widened');

  // Arrows move; Escape closes; Enter then is an ordinary send.
  assert((await selected()) === 'start', 'first selected');
  await box.press('ArrowDown');
  assert((await selected()) === 'status', 'down');
  await box.press('ArrowUp');
  await box.press('ArrowUp');
  assert((await selected()) === 'help', 'up wraps');
  await box.press('Escape');
  await until(async () => (await list.count()) === 0, 'closed by Escape');
  await box.press('Enter');
  await until(() => sent.length === 1, 'plain Enter sends the text');
  assert(textOf(sent[0]) === '/', `sent: ${JSON.stringify(sent[0])}`);

  // Tab puts the selected command in the box.
  await box.pressSequentially('/st');
  await options().first().waitFor({ timeout: 5000 });
  await box.press('ArrowDown');
  await box.press('Tab');
  await until(async () => (await box.inputValue()) === '/status ', 'Tab');
  await until(async () => (await list.count()) === 0, 'closed after Tab');
  assert(sent.length === 1, 'Tab does not send');
  await box.fill('');

  // Enter sends the selected command at once.
  await box.pressSequentially('/he');
  await options().first().waitFor({ timeout: 5000 });
  await box.press('Enter');
  await until(() => sent.length === 2, 'Enter sends the command');
  assert(textOf(sent[1]) === '/help', `sent: ${JSON.stringify(sent[1])}`);
  assert((await box.inputValue()) === '', 'the box emptied');
};

const menuSteps = async () => {
  // The Menu button opens the same list; a click on a command sends it.
  await page.locator('[data-action="bot-menu"]').click();
  await options().first().waitFor({ timeout: 5000 });
  assert((await options().count()) === 3, 'menu lists all');
  await options().nth(1).click();
  await until(() => sent.length === 3, 'a click sends');
  assert(textOf(sent[2]) === '/status', `sent: ${JSON.stringify(sent[2])}`);
  await until(async () => (await list.count()) === 0, 'menu closed');

  // A web-app menu: the button's text; a click opens the mini app
  // (R-Y168, see the web-apps e2e), not a link.
  await open(WEBAPP);
  const link = page.locator('button[data-web-app-menu]');
  await link.waitFor({ timeout: 5000 });
  assert((await link.textContent()).includes('Open app'), 'web app label');
  assert(
    (await page.locator('a[data-action="bot-menu"]').count()) === 0,
    'no link'
  );
};

const groupSteps = async () => {
  // A group: the bots' names, completed as /command@botusername.
  await open(GROUP);
  assert(
    (await page.locator('[data-action="bot-menu"]').count()) === 0,
    'no Menu button in a group'
  );
  await box.click();
  await box.pressSequentially('/');
  await options().first().waitFor({ timeout: 5000 });
  const text = await list.textContent();
  assert(text.includes('Pizza') && text.includes('Taxi'), `names: ${text}`);
  await box.pressSequentially('s');
  await until(async () => (await options().count()) === 2, 'group narrowed');
  await box.press('ArrowDown');
  await box.press('Tab');
  await until(
    async () => (await box.inputValue()) === '/stop@taxi_bot ',
    `group Tab: ${await box.inputValue()}`
  );
  await box.fill('');
  await box.pressSequentially('/sta');
  await options().first().waitFor({ timeout: 5000 });
  await box.press('Enter');
  await until(() => sent.length === 4, 'group Enter sends');
  assert(
    textOf(sent[3]) === '/start@pizza_bot',
    `sent: ${JSON.stringify(sent[3])}`
  );
};

await finish(async () => {
  await botChat();
  await menuSteps();
  await groupSteps();
  // Asked once per chat.
  assert(
    JSON.stringify([...asked].sort()) ===
      JSON.stringify([BOT, WEBAPP, GROUP].sort()),
    `asked: ${JSON.stringify(asked)}`
  );
  if (process.env.E2E_SHOT) {
    await page.screenshot({ path: process.env.E2E_SHOT });
  }
});
