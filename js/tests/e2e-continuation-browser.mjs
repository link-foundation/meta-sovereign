// A real composer, send route and store with a fake Telegram transport.
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import {
  continuationFixture,
  ownMessage,
  PRIVATE,
  PUBLIC,
} from './helpers/telegram-continuation.mjs';

const f = await continuationFixture();
const { store, send, note, history, edits, posts } = f;
const initial = await note(
  PUBLIC,
  ownMessage(PUBLIC, 1, 'Anyone joining the workshop?')
);
await note(PRIVATE, ownMessage(PRIVATE, 1, 'Private conversation'));
const { base, page, until, finish } = await openChatApp('continuation', {
  store,
  send,
  telegramAccount: f.actions(),
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: true, complete: true })
);
await page.route('**/api/telegram/calls', (route) =>
  fulfil(route, { ok: true, calls: [], next: null })
);
await page.route('**/api/telegram/dialog-state', async (route) => {
  const { chat } = route.request().postDataJSON();
  return fulfil(route, {
    ok: true,
    read: await store.get(`read:telegram:${chat}`),
  });
});

const settings = () => page.locator('button[data-view="settings"]').click();
const checkbox = () =>
  page.getByRole('checkbox', {
    name: 'Continue my last message in public chats',
  });
const composer = () => page.locator('.chat-composer textarea');
const submit = async (text) => {
  await composer().fill(text);
  await composer().press('Enter');
};
const openChat = async (chat) => {
  await page.locator('button[data-view="chat"]').click();
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await composer().waitFor();
};
const bubble = (link) => page.locator(`[data-message="${link.id}"]`);
const publicBubble = (id) => bubble({ id: `msg:telegram:${PUBLIC}:${id}` });
const ending = (message) =>
  history.get(PUBLIC).at(-1).message.endsWith(message);

const confirmed = async (draft) => {
  const payload = {
    source: 'telegram',
    chat: PUBLIC,
    continueLast: true,
    ...draft,
  };
  const preview = await page.request.post(`${base}/api/send`, {
    data: payload,
  });
  assert(preview.status() === 428, 'a provider write requires confirmation');
  const { confirm } = await preview.json();
  const response = await page.request.post(`${base}/api/send`, {
    data: { ...payload, confirmToken: confirm.token },
  });
  assert(response.ok(), `confirmed send returned ${response.status()}`);
  return response.json();
};

await finish(async () => {
  await page.goto(`${base}/#/settings`);
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  await openChat(PUBLIC);
  await bubble(initial).waitFor();
  await submit('I can bring the projector.');
  await until(() => ending('I can bring the projector.'), 'default send posts');
  await publicBubble(2).waitFor();
  assert(
    posts.length === 1 && edits.length === 0,
    'off posts a separate message'
  );
  if (process.env.CONTINUATION_SCREENSHOT_BEFORE) {
    await page.screenshot({ path: process.env.CONTINUATION_SCREENSHOT_BEFORE });
  }

  await settings();
  assert(
    !(await checkbox().isChecked({ timeout: 4000 })),
    'setting defaults off'
  );
  await checkbox().check();
  if (process.env.CONTINUATION_SCREENSHOT_SETTING) {
    await page.getByRole('region', { name: 'Sending messages' }).screenshot({
      path: process.env.CONTINUATION_SCREENSHOT_SETTING,
    });
  }
  await page.reload();
  assert(await checkbox().isChecked(), 'setting survives reload');
  await openChat(PUBLIC);
  await submit('I also have a spare adapter.');
  const continued = publicBubble(2);
  const body = () => continued.locator('.bubble-body').textContent();
  await until(
    async () => (await body()).includes('I also have a spare adapter.'),
    'follow-up in message 2'
  );
  assert(
    (await body()).includes('I can bring the projector.'),
    'both paragraphs share message 2'
  );
  assert(
    await continued.locator('.bubble-time .bubble-edited').isVisible(),
    'Telegram edit is marked'
  );
  assert(
    history.get(PUBLIC).length === 2 &&
      posts.length === 1 &&
      edits.length === 1,
    'edit keeps the provider message id and count'
  );
  await page
    .locator('[data-message^="pending:"]')
    .waitFor({ state: 'detached' });
  if (process.env.CONTINUATION_SCREENSHOT_AFTER) {
    await page.screenshot({ path: process.env.CONTINUATION_SCREENSHOT_AFTER });
  }

  await note(
    PUBLIC,
    ownMessage(PUBLIC, 3, 'The room is booked.', {
      out: false,
      fromId: { userId: 24 },
    }),
    { cached: false }
  );
  await submit('Thanks for booking it.');
  await until(
    () => ending('Thanks for booking it.'),
    'incoming provider message breaks the run'
  );
  assert(
    posts.length === 2 && edits.length === 1,
    'no edit behind an unseen incoming message'
  );

  await openChat(PRIVATE);
  await submit('Keep this separate.');
  await until(
    () => posts.some(({ chat }) => chat === PRIVATE),
    'private group sends normally'
  );
  assert(
    history.get(PRIVATE).length === 2 && edits.length === 1,
    'no edit in the private group'
  );

  // Concurrent requests can come from different tabs. A repeated client id
  // shares one edit, and replay after a later edit returns the newest body.
  const one = { text: 'Doors open at six.', clientId: 'tab-one' };
  const two = { text: 'We start at seven.', clientId: 'tab-two' };
  const answer = await Promise.all([
    confirmed(one),
    confirmed(two),
    confirmed(one),
  ]);
  assert(
    answer.every(({ edited }) => edited) && edits.length === 3,
    'two distinct confirmed edits'
  );
  const replay = await confirmed(one);
  assert(
    replay.link.body.includes(one.text) && replay.link.body.includes(two.text),
    'replay shows the latest body without editing again'
  );
  assert(edits.length === 3, 'replay is idempotent');

  // An unread public group can also be handled in Operator.
  await settings();
  await page.locator('[data-action="operator-group"]').check();
  await store.put({
    ...initial,
    id: `msg:telegram:${PUBLIC}:3`,
    sender: '24',
    body: 'The room is booked.',
    raw: history.get(PUBLIC)[2],
  });
  await store.put({
    id: `read:telegram:${PUBLIC}`,
    source: 'telegram',
    kind: 'read',
    chat: PUBLIC,
    inboxMaxId: 2,
    unreadCount: 1,
    unreadTopId: 3,
  });
  await page.locator('button[data-view="operator"]').click();
  await page.locator(`[data-operator-chat="telegram:${PUBLIC}"]`).waitFor();
  await submit('See you there.');
  await until(
    () => ending('See you there.'),
    'Operator continues the provider message'
  );
  assert(
    edits.length === 4 && history.get(PUBLIC).at(-1).id === 4,
    'Operator updates the same public message'
  );
});
