// Real browser e2e for the sending extras and the live location viewer
// (R-Y197), as Telegram Desktop has them: the Send button's menu offers
// "Send when online" (schedule_date 0x7FFFFFFE, listed as "When online")
// only in a private chat whose last seen is visible; in Saved Messages
// scheduling is "Set a reminder" with a "Reminders" list; the pinned
// Saved Messages chats are reordered by drag or Move up / Move down and
// Telegram is asked only on the drop or the click; a live place's map
// follows Telegram's edits (time left, heading); a "Live locations" bar
// opens a panel of everyone sharing (a click goes to the message), "Stop
// sharing" asks first, "Notify when nearby" edits our live place with a
// radius, and the proximity service line is worded. Telegram's answers
// faked in the page, fake chats in a memory store, a server on a free
// port, a headless browser; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:send-extras

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const DAVE = '555';
const HANK = '556';
const ME = '6';
const WHEN_ONLINE = 0x7ffffffe;
const store = createMemoryStore();
const nowS = Math.floor(Date.now() / 1000);

const link = (chat, name, n, extra) => ({
  id: `msg:telegram:${chat}:${n}`,
  source: 'telegram',
  chat,
  chatName: name,
  chatType: 'private',
  timestamp: new Date(Date.now() - 60_000 * (10 - n)).toISOString(),
  ...extra,
});
const theirs = (chat, name, n, extra) =>
  link(chat, name, n, { sender: chat, senderName: name, ...extra });
const live = (lat, lon, extra = {}) => ({
  className: 'MessageMediaGeoLive',
  geo: { lat, long: lon },
  period: 3600,
  ...extra,
});
const daveLive = (lat, lon, heading, edited) =>
  theirs(DAVE, 'Fake Dave', 2, {
    body: '',
    raw: {
      id: 2,
      date: nowS - 120,
      ...(edited ? { editDate: edited } : {}),
      media: live(lat, lon, { heading }),
    },
  });

await store.put(theirs(DAVE, 'Fake Dave', 1, { body: 'hi', raw: { id: 1 } }));
await store.put(daveLive(10.5, 20.25, 90, null));
await store.put(
  link(DAVE, 'Fake Dave', 3, {
    sender: 'me',
    senderName: 'Me',
    body: '',
    raw: { id: 3, out: true, date: nowS - 100, media: live(48.5, 2.25) },
  })
);
await store.put(
  theirs(DAVE, 'Fake Dave', 4, {
    body: '',
    service: 'MessageActionGeoProximityReached',
    raw: {
      id: 4,
      date: nowS - 50,
      action: { className: 'MessageActionGeoProximityReached', distance: 150 },
    },
  })
);
await store.put(theirs(HANK, 'Hidden Hank', 1, { body: 'yo', raw: { id: 1 } }));
await store.put(
  link(ME, 'Saved Messages', 1, {
    sender: 'me',
    senderName: 'Me',
    body: 'note',
    raw: { id: 1 },
  })
);

// What Telegram holds scheduled, by chat.
const scheduled = new Map();
const sent = [];
const send = async (draft) => {
  sent.push(draft);
  if (draft.scheduleDate) {
    const chat = String(draft.chat);
    const list = scheduled.get(chat) ?? [];
    list.push({
      id: 100 + list.length,
      text: draft.text,
      date: draft.scheduleDate,
    });
    scheduled.set(chat, list);
    return { via: 'fake', scheduled: true, links: [] };
  }
  return { via: 'fake' };
};
const linksOf = (chat) =>
  (scheduled.get(chat) ?? [])
    .sort((a, b) => a.date - b.date)
    .map((m) => ({
      id: `sched:telegram:${chat}:${m.id}`,
      source: 'telegram',
      chat,
      sender: 'me',
      body: m.text,
      timestamp: new Date(m.date * 1000).toISOString(),
      scheduled: true,
    }));

const { base, page, until, finish } = await openChatApp('send-extras', {
  store,
  send,
});

await page.route('**/api/telegram/history', (route) =>
  fulfil(route, { written: 0, cached: 0, complete: true })
);
const INFO = {
  [DAVE]: {
    kind: 'user',
    title: 'Fake Dave',
    online: false,
    lastSeen: 'recently',
  },
  // A hidden last seen: neither online nor a last seen.
  [HANK]: { kind: 'user', title: 'Hidden Hank', online: false },
  [ME]: { kind: 'user', title: 'Saved Messages', self: true },
};
const infoSeen = [];
await page.route('**/api/telegram/chat-info*', (route) => {
  const chat = new URL(route.request().url()).searchParams.get('chat');
  infoSeen.push(chat);
  return fulfil(route, { chat, ...(INFO[chat] ?? INFO[DAVE]) });
});
await page.route('**/api/telegram/scheduled*', (route) => {
  const chat = String(route.request().postDataJSON()?.chat ?? '');
  return fulfil(route, { ok: true, chat, links: linksOf(chat) });
});
const mapLats = [];
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
await page.route('**/api/telegram/map*', (route) => {
  mapLats.push(Number(new URL(route.request().url()).searchParams.get('lat')));
  return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
});
const stops = [];
const updates = [];
await page.route('**/api/telegram/stop-live-location', (route) => {
  stops.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});
await page.route('**/api/telegram/update-live-location', (route) => {
  updates.push(route.request().postDataJSON());
  return fulfil(route, { ok: true });
});

// The pinned Saved Messages chats, as Telegram keeps them.
let pins = ['42', '43', '44'];
const NAMES = { 42: 'Ann Lee', 43: 'Bob Ray', 44: 'Cara Fox', 45: 'Dan Poe' };
await page.route('**/api/telegram/saved-dialogs', (route) =>
  fulfil(route, {
    ok: true,
    dialogs: [...pins, '45'].map((peer, i) => ({
      peer,
      kind: 'user',
      name: NAMES[peer],
      id: i + 1,
      date: Date.now() - (i + 1) * 60_000,
      preview: `saved from ${NAMES[peer]}`,
      media: null,
      pinned: pins.includes(peer),
    })),
    complete: true,
    next: null,
  })
);
const reorders = [];
await page.route('**/api/telegram/saved-reorder', (route) => {
  const body = route.request().postDataJSON();
  reorders.push(body);
  pins = body.peers;
  return fulfil(route, { ok: true });
});

const openChat = async (chat) => {
  await page.locator(`[data-chat="telegram:${chat}"]`).click();
  await page.locator('.chat-composer textarea').waitFor({ timeout: 15000 });
};
const sendMenu = async (text) => {
  await page.locator('.chat-composer textarea').fill(text);
  await page.locator('.chat-composer button.send').click({ button: 'right' });
  await page.locator('.msg-context-menu').waitFor({ timeout: 5000 });
};
const item = (name) =>
  page.locator(`.msg-context-menu [data-action="${name}"]`);

const whenOnline = async () => {
  await page.goto(`${base}/`);
  // Hidden last seen: no "Send when online".
  await openChat(HANK);
  await until(() => infoSeen.includes(HANK), 'Hank info read');
  await page.waitForTimeout(300);
  await sendMenu('are you there');
  await item('schedule').waitFor({ timeout: 5000 });
  assert(
    (await item('sendWhenOnline').count()) === 0,
    'hidden: no when online'
  );
  await page.keyboard.press('Escape');

  // A visible last seen: it is offered, and sends the sentinel.
  await openChat(DAVE);
  await page.locator('.chat-composer textarea').fill('');
  await sendMenu('see you');
  await item('sendWhenOnline').waitFor({ timeout: 5000 });
  assert((await item('schedule').count()) === 1, 'Schedule stays');
  assert(
    (await item('sendWhenOnline').innerText()).includes('Send when online'),
    'its words'
  );
  await item('sendWhenOnline').click();
  await until(() => sent.length === 1, 'sent');
  assert(
    sent[0].text === 'see you' && sent[0].scheduleDate === WHEN_ONLINE,
    `sentinel: ${JSON.stringify(sent[0])}`
  );
  const clock = page.locator('[data-action="scheduled"]');
  await until(async () => (await clock.count()) === 1, 'the clock');
  await clock.click();
  const list = page.locator('.scheduled-dialog');
  await list.waitFor({ timeout: 5000 });
  const row = list.locator('.scheduled-item');
  assert(
    (await row.innerText()).includes('When online'),
    'listed as When online'
  );
  assert(!/20\d\d/.test(await row.innerText()), 'no date for it');
  assert((await list.locator('.scheduled-day').count()) === 0, 'no day head');
  assert(
    (await list.locator('h3').innerText()) === 'Scheduled messages',
    'title'
  );
  await list.locator('.delete-dialog-btns button').click();
};

const reminders = async () => {
  await openChat(ME);
  await until(() => infoSeen.includes(ME), 'saved info read');
  await sendMenu('pay rent');
  await item('scheduleReminder').waitFor({ timeout: 5000 });
  assert((await item('schedule').count()) === 0, 'not "Schedule message"');
  assert(
    (await item('scheduleReminder').innerText()).includes('Set a reminder'),
    'Set a reminder'
  );
  assert((await item('sendWhenOnline').count()) === 0, 'no when online here');
  await item('scheduleReminder').click();
  const dialog = page.locator('.schedule-dialog');
  await dialog.waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('h3').innerText()) === 'Set a reminder',
    'dialog'
  );
  await dialog.locator('[data-action="schedule-confirm"]').click();
  await until(() => sent.length === 2, 'reminder sent');
  assert(
    sent[1].scheduleDate > nowS + 3000 && sent[1].scheduleDate < nowS + 4200,
    'in about an hour'
  );
  const clock = page.locator('[data-action="scheduled"]');
  await until(async () => (await clock.count()) === 1, 'the clock');
  assert(
    /reminder/i.test(await clock.getAttribute('title')),
    'clock says reminders'
  );
  await clock.click();
  const list = page.locator('.scheduled-dialog');
  await list.waitFor({ timeout: 5000 });
  assert((await list.locator('h3').innerText()) === 'Reminders', 'Reminders');
  await list.locator('.delete-dialog-btns button').click();
};

const dragStep = async () => {
  await page.locator('[data-action="saved-view"]').click();
  await page.locator('[data-saved-peer="42"]').waitFor({ timeout: 5000 });
  const order = async () =>
    (
      await page
        .locator('[data-saved="chats"] [data-saved-peer]')
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.savedPeer))
    ).join(',');
  assert((await order()) === '42,43,44,45', `listed: ${await order()}`);
  assert(
    (await page.locator('[data-saved-drag="45"]').count()) === 0,
    'an unpinned chat is not draggable'
  );
  assert(
    await page
      .locator('[data-saved-pin="42"][data-action="saved-move-up"]')
      .isDisabled(),
    'the first cannot go up'
  );

  // A drag: nothing is asked until the drop.
  const data = await page.evaluateHandle(() => new globalThis.DataTransfer());
  const from = page.locator('[data-saved-drag="44"]');
  const to = page.locator('[data-saved-drag="42"]');
  await from.dispatchEvent('dragstart', { dataTransfer: data });
  await to.dispatchEvent('dragover', { dataTransfer: data });
  await page.waitForTimeout(200);
  assert(reorders.length === 0, 'nothing asked while dragging');
  await to.dispatchEvent('drop', { dataTransfer: data });
  await until(() => reorders.length === 1, 'asked on the drop');
  assert(
    JSON.stringify(reorders[0]) ===
      JSON.stringify({ peers: ['44', '42', '43'] }),
    `drop: ${JSON.stringify(reorders[0])}`
  );
  assert((await order()) === '44,42,43,45', `shown: ${await order()}`);

  // The keyboard's way: Move down, one call per click.
  await page
    .locator('[data-saved-pin="44"][data-action="saved-move-down"]')
    .click();
  await until(() => reorders.length === 2, 'asked on the click');
  assert(
    JSON.stringify(reorders[1]) ===
      JSON.stringify({ peers: ['42', '44', '43'] }),
    `move: ${JSON.stringify(reorders[1])}`
  );
  assert((await order()) === '42,44,43,45', `moved: ${await order()}`);
};

const liveMap = async () => {
  await openChat(DAVE);
  const bubble = page.locator(`[data-message="msg:telegram:${DAVE}:2"]`);
  await bubble.waitFor({ timeout: 10000 });
  await until(() => mapLats.includes(10.5), 'the first map');
  const text = await bubble.innerText();
  assert(/\d+ min left/.test(text), `time left: ${text}`);
  assert(/updated \d+ min ago/.test(text), `updated: ${text}`);
  assert(
    (await bubble.locator('[data-heading="90"]').count()) === 1,
    'the heading arrow'
  );

  // The bar and the panel list both live places.
  const bar = page.locator('[data-live="bar"]');
  await bar.waitFor({ timeout: 5000 });
  assert((await bar.innerText()).includes('Live locations'), 'bar title');
  await bar.locator('[data-action="live-open"]').click();
  const panel = page.locator('[data-dialog="live-locations"]');
  await panel.waitFor({ timeout: 5000 });
  const rows = panel.locator('[data-live-share]');
  assert((await rows.count()) === 2, `two sharing: ${await rows.count()}`);
  const dave = panel.locator('[data-live-own="false"]');
  assert((await dave.innerText()).includes('Fake Dave'), 'named');
  assert(/\d+ min left/.test(await dave.innerText()), 'its time left');
  assert(
    (await panel.locator('[data-live-own="true"]').innerText()).includes('You'),
    'ours'
  );

  // Telegram edits Dave's place: the map, the line and the arrow follow.
  await store.put(daveLive(11.25, 21.5, 180, nowS));
  await until(() => mapLats.includes(11.25), 'the map moved');
  await until(
    async () => /updated just now/.test(await dave.innerText()),
    'the panel row is updated'
  );
  await until(
    async () =>
      (await bubble.locator('[data-heading="180"]').count()) === 1 &&
      /updated just now/.test(await bubble.innerText()),
    'the bubble is updated'
  );

  // "Notify when nearby" edits our own place with a radius.
  const own = panel.locator('[data-live-own="true"]');
  await own.locator('[data-action="live-nearby"]').click();
  assert(updates.length === 0, 'nothing sent before Set');
  await own.locator('[data-field="proximity"]').fill('250');
  await own.locator('[data-action="live-nearby-set"]').click();
  await until(() => updates.length === 1, 'the radius sent');
  assert(
    updates[0].chat === DAVE &&
      updates[0].id === 3 &&
      updates[0].proximity === 250 &&
      updates[0].lat === 48.5 &&
      updates[0].lon === 2.25,
    `radius: ${JSON.stringify(updates[0])}`
  );

  // A click goes to the message.
  await dave.locator('[data-action="live-go"]').click();
  await panel.waitFor({ state: 'detached', timeout: 5000 });
  await until(
    async () =>
      (await bubble.evaluate((n) => Boolean(n.closest('.is-found')))) === true,
    'scrolled to the message'
  );
};

const stopSharing = async () => {
  const bar = page.locator('[data-live="bar"]');
  assert(updates.length === 1 && stops.length === 0, 'no stop yet');
  await bar.locator('[data-action="live-stop"]').click();
  const confirm = page.locator('[data-live="stop-confirm"]');
  await confirm.waitFor({ timeout: 5000 });
  assert(stops.length === 0, 'asked first');
  await confirm.locator('[data-action="live-stop-no"]').click();
  await confirm.waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForTimeout(200);
  assert(stops.length === 0, 'cancel stops nothing');
  await bar.locator('[data-action="live-stop"]').click();
  await confirm.locator('[data-action="live-stop-yes"]').click();
  await until(() => stops.length === 1, 'stop sent');
  assert(
    stops[0].chat === DAVE && stops[0].id === 3,
    `stop: ${JSON.stringify(stops[0])}`
  );
  await until(
    async () => (await bar.locator('[data-action="live-stop"]').count()) === 0,
    'ours gone from the bar'
  );
  assert((await bar.count()) === 1, 'Dave still shares');
};

const proximityLine = async () => {
  const line = page.locator(`[data-message="msg:telegram:${DAVE}:4"]`);
  await line.waitFor({ timeout: 5000 });
  assert(
    (await line.innerText()).includes('Fake Dave is now within 150 m from you'),
    `service line: ${await line.innerText()}`
  );
};

await finish(async () => {
  await whenOnline();
  await reminders();
  await dragStep();
  await liveMap();
  await stopSharing();
  await proximityLine();
});
