// Real browser e2e for checklist extras, reaction reports and the
// remaining statistics views (R-Y195), as Telegram Desktop has them:
// "Add tasks" on a checklist (own, or one that lets others add) sends the
// new tasks only on Add, with who ticked a task and when shown; a new
// checklist is made from the paperclip's menu with its two switches; an
// admin reports a reaction after a confirmation (and Cancel sends
// nothing); a channel post's Statistics shows its graphs and the public
// shares a page at a time with a link to each post; a channel's
// statistics end with the Stars revenue (balances, USD, graph). Telegram's
// answers faked in the page, fake chats in a memory store, a server on a
// free port, a headless browser; nothing reaches a network or a running
// app, nothing is sent. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:checklist-stats

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const USER = '555';
const GROUP = '-5';
const CHANNEL = '-1001';
const store = createMemoryStore();
const at = (n) => new Date(Date.now() - 60_000 * (100 - n)).toISOString();
const put = ({ chat, name, type, n, sender, body = '', raw = {} }) =>
  store.put({
    id: `msg:telegram:${chat}:${n}`,
    source: 'telegram',
    chat,
    chatName: name,
    chatType: type,
    sender,
    senderName: sender === 'me' ? 'You' : name,
    body,
    timestamp: at(n),
    raw: { id: n, ...raw },
  });
const todo = (title, others, items, completions = []) => ({
  media: {
    className: 'MessageMediaToDo',
    todo: {
      title: { text: title },
      othersCanAppend: others,
      othersCanComplete: true,
      list: items.map(([id, text]) => ({ id, title: { text } })),
    },
    completions,
  },
});
const DONE = Math.floor(Date.now() / 1000) - 3600;
await put({
  chat: USER,
  name: 'Fake Dave',
  type: 'user',
  n: 1,
  sender: USER,
  body: 'hello',
});
const dave = { chat: USER, name: 'Fake Dave', type: 'user' };
await put({
  ...dave,
  n: 2,
  sender: 'me',
  raw: {
    out: true,
    ...todo(
      'Groceries',
      false,
      [
        [1, 'Milk'],
        [2, 'Eggs'],
      ],
      [{ id: 1, completedBy: { userId: '31' }, date: DONE }]
    ),
  },
});
await put({
  ...dave,
  n: 3,
  sender: USER,
  raw: todo('Closed', false, [[1, 'A']]),
});
await put({
  ...dave,
  n: 4,
  sender: USER,
  raw: todo('Open', true, [[1, 'B']]),
});
const results = [
  { reaction: { className: 'ReactionEmoji', emoticon: '👍' }, count: 2 },
];
await put({
  chat: GROUP,
  name: 'Fake Group',
  type: 'group',
  n: 1,
  sender: '31',
  body: 'her message',
  raw: { reactions: { results } },
});
await put({
  chat: CHANNEL,
  name: 'News Channel',
  type: 'channel',
  n: 1,
  sender: CHANNEL,
  body: 'Big news',
});

const INFO = {
  [USER]: { kind: 'user', title: 'Fake Dave' },
  [GROUP]: { kind: 'group', title: 'Fake Group', canBan: true },
  [CHANNEL]: {
    kind: 'channel',
    title: 'News Channel',
    broadcast: true,
    canViewStats: true,
    canViewStarsRevenue: true,
  },
};

const DAY = 86_400_000;
const START = Date.UTC(2024, 0, 1);
const days = Array.from({ length: 10 }, (_, i) => START + i * DAY);
const chart = (name) => ({
  columns: [
    ['x', ...days],
    ['y0', ...days.map((_, i) => 5 + i * 2)],
  ],
  types: { x: 'x', y0: 'line' },
  names: { y0: name },
  colors: { y0: '#3497ed' },
});

const { base, page, until, finish } = await openChatApp('checklist-stats', {
  store,
});
await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
await page.route('**/api/telegram/scheduled', (route) =>
  fulfil(route, { ok: true, messages: [] })
);
await page.route('**/api/telegram/shared-counts', (route) =>
  fulfil(route, { ok: true, counts: {} })
);
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  return fulfil(route, { chat, ...(INFO[chat] ?? {}) });
});
const asked = {};
const record = (name, answer) =>
  page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON();
    (asked[name] ??= []).push(body);
    return fulfil(route, typeof answer === 'function' ? answer(body) : answer);
  });
await record('send-todo', { ok: true, chat: USER });
await record('todo-append', { ok: true, added: 2 });
await record('reaction-report', { ok: true });
await record('reactors', {
  ok: true,
  count: 2,
  items: [
    { peer: '31', name: 'Ann Fake', emoji: '👍', date: Date.now(), my: false },
    { peer: '32', name: 'Bob Fake', emoji: '👍', date: Date.now(), my: true },
  ],
  next: null,
});
await record('message-stats', {
  ok: true,
  graphs: [{ key: 'views', graph: { json: JSON.stringify(chart('Views')) } }],
});
const share = (name, id, views, username) => ({
  kind: 'message',
  name,
  chat: `-100${id}`,
  id,
  views,
  date: Math.floor(Date.now() / 1000) - 7200,
  ...(username ? { username } : {}),
});
await record('public-forwards', (body) =>
  body.offset === 'o2'
    ? { ok: true, count: 3, items: [share('Third Channel', 9, 5)], next: null }
    : {
        ok: true,
        count: 3,
        items: [share('Fans', 21, 1500, 'fans'), share('Others', 22, 30)],
        next: 'o2',
      }
);
await record('chat-stats', {
  ok: true,
  kind: 'broadcast',
  period: { from: START / 1000, to: (START + 9 * DAY) / 1000 },
  overview: [{ key: 'followers', current: 100, previous: 90 }],
  graphs: [],
  posts: [],
});
await record('stars-revenue', {
  ok: true,
  graph: { json: JSON.stringify(chart('Revenue')) },
  status: {
    current: 1200,
    available: 800,
    overall: 5000.5,
    withdrawalEnabled: true,
  },
  usdRate: 0.013,
});

const row = (chat, n) =>
  page.locator(`.chat-scroll [data-message="msg:telegram:${chat}:${n}"]`);
const open = async (chat, last) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await row(chat, last).waitFor({ timeout: 15000 });
};
const menuOn = async (chat, n) => {
  await row(chat, n).locator('.bubble-body, .bubble').first().click({
    button: 'right',
  });
  await page.locator('.msg-context-menu').waitFor({ timeout: 5000 });
};
const action = (name) =>
  page.locator(`.msg-context-menu [data-action="${name}"]`);

// Add tasks to a checklist
const addTasks = async () => {
  await open(USER, 4);
  const own = row(USER, 2);
  await own.locator('.bubble-todo').waitFor({ timeout: 10000 });
  assert(
    (await own.locator('[data-todo-by="1"]').count()) === 1 &&
      (await own.locator('[data-todo-by="1"]').textContent()).includes('done'),
    'who ticked a task and when is shown'
  );
  assert(
    (await own.locator('[data-todo-by="2"]').count()) === 0,
    'an open task shows no tick'
  );
  assert(
    (await row(USER, 3).locator('[data-action="todo-add-open"]').count()) === 0,
    "no Add tasks on someone else's closed checklist"
  );
  assert(
    (await row(USER, 4).locator('[data-action="todo-add-open"]').count()) === 1,
    'Add tasks where others may add'
  );
  await own.locator('[data-action="todo-add-open"]').click();
  const form = own.locator('[data-todo-add]');
  const add = form.locator('[data-action="todo-add"]');
  assert(await add.isDisabled(), 'Add is off without tasks');
  await form
    .locator('[data-field="todo-tasks"]')
    .fill(`Bread\n${'x'.repeat(65)}`);
  assert(await add.isDisabled(), 'a task over 64 characters is refused');
  assert(
    (await form.textContent()).includes('64 characters'),
    'the problem is told'
  );
  await form.locator('[data-field="todo-tasks"]').fill('Bread\n\n  Butter  ');
  assert(!(await add.isDisabled()), 'Add is on');
  assert(!asked['todo-append'], 'nothing sent before Add');
  await add.click();
  await until(() => asked['todo-append']?.length === 1, 'tasks added');
  assert(
    JSON.stringify(asked['todo-append'][0]) ===
      `{"chat":"${USER}","id":2,"items":["Bread","Butter"]}`,
    `append body: ${JSON.stringify(asked['todo-append'][0])}`
  );
  await until(
    async () => (await own.locator('[data-todo-add]').count()) === 0,
    'the form closes'
  );
};

// a new checklist from the paperclip
const newChecklist = async () => {
  await page.locator('[data-action="attach"]').click();
  await page.locator('[data-action="attach-todo"]').click();
  const dialog = page.locator('.poll-dialog');
  await dialog.waitFor({ timeout: 5000 });
  const create = dialog.locator('[data-action="todo-create"]');
  assert(await create.isDisabled(), 'Create is off while empty');
  await dialog.locator('[data-field="title"]').fill('Trip');
  const tasks = dialog.locator('[data-field="task"]');
  await tasks.nth(0).fill('Tickets');
  await until(async () => (await tasks.count()) === 2, 'the next task field');
  await tasks.nth(1).fill('Hotel');
  await dialog.locator('[data-option="others-append"] input').uncheck();
  assert(!(await create.isDisabled()), 'Create is on');
  assert(!asked['send-todo'], 'nothing sent before Create');
  await create.click();
  await until(() => asked['send-todo']?.length === 1, 'checklist sent');
  const sent = asked['send-todo'][0];
  assert(
    sent.chat === USER &&
      sent.title === 'Trip' &&
      JSON.stringify(sent.items) === '["Tickets","Hotel"]' &&
      sent.othersCanAppend === false &&
      sent.othersCanComplete === true &&
      typeof sent.clientId === 'string',
    `send body: ${JSON.stringify(sent)}`
  );
  await until(
    async () => (await page.locator('.poll-dialog').count()) === 0,
    'the dialog closes'
  );
};

// report a reaction
const reportReaction = async () => {
  await open(GROUP, 1);
  await menuOn(GROUP, 1);
  await action('reactors').click();
  const panel = page.locator('[data-dialog="readers"]');
  await panel.locator('[data-reader="reacted"]').first().waitFor({
    timeout: 5000,
  });
  assert(
    (await panel.locator('[data-action="reaction-report"]').count()) === 1,
    "Report beside someone else's reaction only"
  );
  await panel.locator('[data-action="reaction-report"]').click();
  const confirm = panel.locator('[data-report-confirm]');
  await confirm.waitFor({ timeout: 5000 });
  assert(
    (await confirm.textContent()).includes('Ann Fake'),
    'names the member'
  );
  await confirm.getByText('Cancel').click();
  assert(!asked['reaction-report'], 'Cancel reports nothing');
  await panel.locator('[data-action="reaction-report"]').click();
  await panel.locator('[data-action="reaction-report-confirm"]').click();
  await until(() => asked['reaction-report']?.length === 1, 'reported');
  assert(
    JSON.stringify(asked['reaction-report'][0]) ===
      `{"chat":"${GROUP}","id":1,"peer":"31"}`,
    `report body: ${JSON.stringify(asked['reaction-report'][0])}`
  );
  await panel.getByText('was reported').waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await until(async () => (await panel.count()) === 0, 'closed');
};

// a post's statistics and its public shares
const postStats = async () => {
  await open(CHANNEL, 1);
  await menuOn(CHANNEL, 1);
  await action('messageStats').click();
  const post = page.locator('[data-dialog="message-stats"]');
  await post
    .locator('[data-graph="views"] svg path[data-shape]')
    .first()
    .waitFor({
      timeout: 5000,
    });
  const forwards = post.locator('[data-forward="message"]');
  await until(async () => (await forwards.count()) === 2, 'first page');
  assert(
    (await post.locator('[data-stats-shares]').textContent()).includes(
      '3 public shares'
    ),
    'the count'
  );
  const first = await forwards.nth(0).textContent();
  assert(
    first.includes('Fans') && first.includes('1,500 views'),
    `a share's channel and views: ${first}`
  );
  assert(
    (await forwards.nth(0).locator('a').getAttribute('href')) ===
      'https://t.me/fans/21',
    'a link by username'
  );
  assert(
    (await forwards.nth(1).locator('a').getAttribute('href')) ===
      'https://t.me/c/22/22',
    'a link by channel id'
  );
  await post.locator('[data-action="forwards-more"]').click();
  await until(async () => (await forwards.count()) === 3, 'second page');
  assert(
    JSON.stringify(asked['public-forwards'].map((b) => b.offset ?? null)) ===
      '[null,"o2"]',
    `paging: ${JSON.stringify(asked['public-forwards'])}`
  );
  assert(
    (await post.locator('[data-action="forwards-more"]').count()) === 0,
    'no more pages'
  );
  await page.keyboard.press('Escape');
  await until(async () => (await post.count()) === 0, 'post stats closed');
};

// Stars revenue in the channel's statistics
const starsRevenue = async () => {
  const about = page.locator('.person-panel');
  if ((await about.count()) === 0) {
    await page.locator('[data-action="chat-about"]').click();
  }
  await page.locator('.person-panel [data-action="stats-open"]').click();
  const stars = page.locator('[data-dialog="stats"] [data-stats-stars]');
  await stars.locator('[data-stars-balance="current"]').waitFor({
    timeout: 5000,
  });
  const balance = (name) =>
    stars.locator(`[data-stars-balance="${name}"]`).textContent();
  const current = await balance('current');
  assert(
    current.includes('1,200') && current.includes('$15.60'),
    `current: ${current}`
  );
  assert((await balance('available')).includes('$10.40'), 'available in USD');
  assert((await balance('overall')).includes('5,000.5'), 'overall');
  assert(
    (await stars.locator('[data-stars-rate]').textContent()).includes('$0.01'),
    'the rate'
  );
  await stars
    .locator('[data-graph="revenue"] svg path[data-shape]')
    .first()
    .waitFor({
      timeout: 5000,
    });
  assert(
    asked['stars-revenue'].length === 1 &&
      asked['stars-revenue'][0].chat === CHANNEL,
    'asked for the channel'
  );
};

await finish(async () => {
  await page.goto(`${base}/`);
  await addTasks();
  await newChecklist();
  await reportReaction();
  await postStats();
  await starsRevenue();
});
