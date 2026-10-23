// Account-level settings (R-Y212): Change phone number, the account's
// self-destruct periods, and "Export Telegram data" through a takeout
// session (the request checked, every request wrapped in invokeWithTakeout,
// the session finished, the delay message, Cancel, one export at a time,
// the folder the server chooses, the routes) plus the page's pure helpers.
// Fake clients and a temp directory; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createAccountData,
  parseDataExport,
} from '../src/sources/telegram-account-data.js';
import {
  delayOf,
  takeoutFlags,
} from '../src/sources/telegram-account-data-run.js';
import { createPhoneChange } from '../src/sources/telegram-phone-change.js';
import { ACCOUNT_TTL_DAYS } from '../src/sources/telegram-security.js';
import { createFetchQueue, NO_PACE } from '../src/sources/telegram-history.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { postRoute } from './helpers/telegram-route.js';
import {
  Api,
  helpers,
  rpcError,
  takeoutFake,
} from './helpers/takeout-fakes.mjs';
import {
  ACCOUNT_MONTHS,
  daysOfMonths,
  monthsOfDays,
} from '../src/web/chat-security.js';
import {
  chatsPercent,
  cleanPhone,
  dataFormReady,
  dataRequestOf,
  delayText,
  DEFAULT_DATA_FORM,
} from '../src/web/chat-account-data.js';

const KINDS_ALL = {
  personal: true,
  bots: true,
  privateGroups: true,
  privateChannels: true,
  publicChats: true,
};

const setup = async (hooks = {}) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-data-export-'));
  const storeDir = path.join(dir, 'store');
  await fs.mkdir(storeDir, { recursive: true });
  const { client, log } = takeoutFake(hooks);
  const clock = Date.parse('2026-02-01T10:00:00');
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    queue: createFetchQueue({ pace: NO_PACE, now: () => clock }),
    store: createMemoryStore(),
    sleep: async () => {},
  };
  const revealed = [];
  const actions = createAccountData(env, {
    userClient: async () => client,
    mediaDir: path.join(storeDir, 'media', 'telegram'),
    home: dir,
    now: () => clock,
    reveal: async (folder) => revealed.push(folder),
  });
  return { dir, storeDir, actions, log, revealed, env, client };
};

const request = (patch = {}) => ({
  info: true,
  contacts: true,
  kinds: { personal: true, privateGroups: true, publicChats: true },
  media: false,
  formats: ['json', 'html'],
  ...patch,
});

// Waits on the clock, not on a count of event-loop turns: the export does file
// I/O, and how many turns that takes differs per runtime (bun, deno; R-Z6).
const finished = async (actions) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const { job } = await actions.dataExportStatus();
    if (job && !['running', 'cancelling'].includes(job.state)) {
      return job;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 2));
  }
  throw new Error('the export did not end');
};

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

test('the takeout flags follow the chosen kinds', () => {
  const flags = (kinds, extra = {}) =>
    takeoutFlags({
      kinds: { ...KINDS_ALL, ...kinds },
      contacts: false,
      ...extra,
    });
  assert.deepEqual(
    takeoutFlags({
      contacts: true,
      kinds: { personal: true, bots: false, privateGroups: false },
    }),
    { contacts: true, messageUsers: true }
  );
  const none = { personal: false, bots: false, privateGroups: false };
  assert.deepEqual(
    flags({ ...none, privateChannels: false, publicChats: true }),
    { messageMegagroups: true, messageChannels: true }
  );
  assert.deepEqual(
    flags({ ...none, privateChannels: true, publicChats: false }),
    { messageChannels: true }
  );
  assert.deepEqual(
    flags({
      ...none,
      privateGroups: true,
      privateChannels: false,
      publicChats: false,
    }),
    { messageChats: true, messageMegagroups: true }
  );
});

test('TAKEOUT_INIT_DELAY_X is read from the error or its seconds', () => {
  assert.equal(delayOf(rpcError('TAKEOUT_INIT_DELAY_86400')), 86400);
  assert.equal(delayOf(rpcError('TAKEOUT_INIT_DELAY', { seconds: 120 })), 120);
  assert.equal(delayOf(new Error('nothing')), 0);
});

test('the export request is checked', () => {
  assert.equal(parseDataExport(request()).ok, true);
  const bad = (patch) => parseDataExport(request(patch)).code;
  assert.equal(bad({ kinds: { nope: true } }), 'bad-request');
  assert.equal(bad({ kinds: { personal: 'yes' } }), 'bad-request');
  assert.equal(bad({ formats: [] }), 'bad-request');
  assert.equal(bad({ formats: ['pdf'] }), 'bad-request');
  assert.equal(bad({ sizeLimitMb: 0 }), 'bad-request');
  assert.equal(bad({ sizeLimitMb: 5000 }), 'bad-request');
  assert.equal(bad({ from: '2026-13-01' }), 'bad-request');
  assert.equal(bad({ from: '2026-02-02', to: '2026-02-01' }), 'bad-request');
  assert.equal(bad({ media: 'all' }), 'bad-request');
  assert.equal(bad({ info: false, contacts: false, kinds: {} }), 'bad-request');
  const ok = parseDataExport(request({ media: true, sizeLimitMb: 20 })).value;
  assert.equal(ok.chatOptions.media.photos, true);
  assert.equal(ok.chatOptions.media.stickers, false);
  assert.equal(ok.chatOptions.sizeLimitMb, 20);
  assert.equal(
    parseDataExport(request({ media: false })).value.chatOptions.media.files,
    false
  );
});

test('an export runs through a takeout session and writes the folder', async () => {
  const { actions, log, storeDir } = await setup();
  const started = await actions.dataExportStart(request());
  assert.equal(started.ok, true);
  const job = await finished(actions);
  assert.equal(job.state, 'done');
  // The session was opened with the flags of the chosen kinds.
  assert.equal(log.init.length, 1);
  assert.equal(log.init[0].contacts, true);
  assert.equal(log.init[0].messageUsers, true);
  assert.equal(log.init[0].messageChats, true);
  assert.equal(log.init[0].messageMegagroups, true);
  assert.equal(log.init[0].messageChannels, true);
  assert.equal(log.init[0].files, undefined);
  // Every request after it was wrapped; the session ended with success.
  assert.deepEqual(log.bare, []);
  assert.ok(log.wrapped.length > 0);
  assert.ok(log.wrapped.every((w) => w.takeoutId === '555'));
  assert.deepEqual(log.finished, [{ takeoutId: '555', success: true }]);
  // The folder is the server's choice, under the store's exports.
  assert.equal(
    job.folder,
    path.join(storeDir, 'exports', 'DataExport_2026-02-01')
  );
  // Personal (Alice), the private group, the public channel, the private
  // supergroup; not the bot, not the private channel.
  const result = await readJson(path.join(job.folder, 'result.json'));
  assert.equal(result.personal_information.phone_number, '+15550001');
  assert.equal(result.personal_information.bio, 'my bio');
  assert.equal(result.contacts.list.length, 1);
  assert.equal(result.contacts.list[0].first_name, 'Alice');
  assert.deepEqual(result.chats.list.map((c) => [c.name, c.type]).sort(), [
    ['Alice Liddell', 'personal_chat'],
    ['Family', 'private_group'],
    ['News', 'public_channel'],
    ['Secret club', 'private_supergroup'],
  ]);
  assert.equal(job.chatsDone, 4);
  assert.equal(job.chatsTotal, 4);
  assert.equal(job.messages, 5);
  const alice = await readJson(
    path.join(job.folder, result.chats.list[0].folder, 'result.json')
  );
  assert.equal(alice.type, 'personal_chat');
  assert.equal(alice.messages.length, 2);
  await fs.access(path.join(job.folder, 'export_results.html'));
  await fs.access(
    path.join(job.folder, result.chats.list[0].folder, 'messages.html')
  );
});

test('media asks the session for files up to the limit', async () => {
  const { actions, log } = await setup();
  await actions.dataExportStart(
    request({ media: true, sizeLimitMb: 20, formats: ['json'] })
  );
  await finished(actions);
  assert.equal(log.init[0].files, true);
  assert.equal(log.init[0].fileMaxSize, 20n * 1024n * 1024n);
});

test('a date range limits the messages of every chat', async () => {
  const { actions } = await setup();
  await actions.dataExportStart(
    request({ from: '2026-01-02', to: '2026-01-03', formats: ['json'] })
  );
  const job = await finished(actions);
  // Alice's second message (day 2) and the family chat's (day 3).
  assert.equal(job.messages, 2);
});

test('Telegram asking to wait is answered with the seconds', async () => {
  const { actions, log } = await setup({
    initError: rpcError('TAKEOUT_INIT_DELAY_3600'),
  });
  const answer = await actions.dataExportStart(request());
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'takeout-delay');
  assert.equal(answer.seconds, 3600);
  assert.deepEqual(log.finished, []);
  assert.equal((await actions.dataExportStatus()).job, null);
});

test('Cancel stops the export, ends the session without success and keeps what was written', async () => {
  let release = null;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { actions, log } = await setup({
    onHistory: async (_request, calls) => {
      if (
        calls.wrapped.filter((w) => w.name === 'messages.GetHistory').length ===
        1
      ) {
        await gate;
      }
    },
  });
  await actions.dataExportStart(request({ formats: ['json'] }));
  for (
    let i = 0;
    i < 500 && log.wrapped.every((w) => w.name !== 'messages.GetHistory');
    i += 1
  ) {
    await new Promise((resolve) => globalThis.setImmediate(resolve));
  }
  // One at a time while it runs.
  assert.equal((await actions.dataExportStart(request())).code, 'busy');
  assert.equal((await actions.dataExportCancel()).job.state, 'cancelling');
  release();
  const job = await finished(actions);
  assert.equal(job.state, 'cancelled');
  assert.deepEqual(log.finished, [{ takeoutId: '555', success: false }]);
  assert.ok(job.chatsDone < 4);
  await fs.access(path.join(job.folder, 'result.json'));
});

test('a second export gets its own folder; reveal opens the finished one', async () => {
  const { actions, revealed } = await setup();
  assert.equal((await actions.dataExportReveal()).code, 'no-export');
  await actions.dataExportStart(request({ formats: ['json'] }));
  const first = await finished(actions);
  await actions.dataExportStart(request({ formats: ['json'] }));
  // The new job starts as running; wait for the end of the second.
  const second = await finished(actions);
  assert.notEqual(first.folder, second.folder);
  assert.ok(second.folder.endsWith('DataExport_2026-02-01 (1)'));
  assert.equal((await actions.dataExportReveal()).ok, true);
  assert.deepEqual(revealed, [second.folder]);
});

test('a refused request starts nothing', async () => {
  const { actions, log } = await setup();
  const answer = await actions.dataExportStart(request({ formats: [] }));
  assert.equal(answer.code, 'bad-request');
  assert.equal(log.init.length, 0);
});

// ---- change phone number -----------------------------------------------

const phoneSetup = (hooks) => {
  const { client, log } = takeoutFake(hooks);
  const actions = createPhoneChange(
    { importer: async () => ({ Api, helpers }) },
    { userClient: async () => client }
  );
  return { actions, log };
};

test('the phone changes after the code Telegram sent', async () => {
  const { actions, log } = phoneSetup();
  const sent = await actions.phoneChangeSend({ phone: '+15550009' });
  assert.deepEqual(sent, {
    ok: true,
    phoneCodeHash: 'hash1',
    length: 5,
    timeout: 60,
  });
  assert.equal(log.phone[0].phoneNumber, '+15550009');
  assert.equal(log.phone[0].settings.className, 'CodeSettings');
  const done = await actions.phoneChangeConfirm({
    phone: '+15550009',
    phoneCodeHash: 'hash1',
    code: '12345',
  });
  assert.deepEqual(done, { ok: true, phone: '15550009' });
  assert.equal(log.phone[1].phoneCode, '12345');
});

test("Telegram's refusals of a phone change become codes", async () => {
  const send = (message) =>
    phoneSetup({ phoneError: rpcError(message) }).actions.phoneChangeSend({
      phone: '+15550009',
    });
  assert.equal((await send('PHONE_NUMBER_OCCUPIED')).code, 'occupied');
  assert.equal((await send('PHONE_NUMBER_INVALID')).code, 'phone-invalid');
  assert.equal((await send('FLOOD_WAIT_30')).code, 'flood');
  const confirm = (message) =>
    phoneSetup({ changeError: rpcError(message) }).actions.phoneChangeConfirm({
      phone: '+15550009',
      phoneCodeHash: 'h',
      code: '11111',
    });
  assert.equal((await confirm('PHONE_CODE_INVALID')).code, 'code-invalid');
  assert.equal((await confirm('PHONE_CODE_EXPIRED')).code, 'code-expired');
  assert.equal((await confirm('PHONE_NUMBER_OCCUPIED')).code, 'occupied');
  const { actions, log } = phoneSetup();
  assert.equal(
    (await actions.phoneChangeSend({ phone: 'abc' })).code,
    'phone-invalid'
  );
  assert.equal(
    (
      await actions.phoneChangeConfirm({
        phone: '+15550009',
        phoneCodeHash: 'h',
        code: 'x',
      })
    ).code,
    'code-invalid'
  );
  assert.equal(log.phone.length, 0);
});

// ---- self-destruct periods ---------------------------------------------

test('the self-destruct periods run to two years', () => {
  assert.deepEqual(ACCOUNT_TTL_DAYS, [30, 90, 180, 365, 548, 730]);
  assert.deepEqual(ACCOUNT_MONTHS.map(daysOfMonths), ACCOUNT_TTL_DAYS);
  assert.equal(monthsOfDays(548), 18);
  assert.equal(monthsOfDays(730), 24);
  assert.equal(monthsOfDays(100), null);
});

// ---- the routes -----------------------------------------------------------

test('the routes check their bodies', async () => {
  const calls = [];
  const note = (name) => async (body) => {
    calls.push(name);
    return { ok: true, body };
  };
  const account = {
    phoneChangeSend: note('send'),
    phoneChangeConfirm: note('confirm'),
    dataExportStart: note('start'),
    dataExportStatus: note('status'),
    dataExportCancel: note('cancel'),
    dataExportReveal: note('reveal'),
    setAccountTtl: note('ttl'),
  };
  const status = (route, body) => postRoute(route, body, account);
  assert.equal(await status('phone-change-send', { phone: '+15550009' }), 200);
  assert.equal(await status('phone-change-send', { phone: 'x' }), 400);
  assert.equal(
    await status('phone-change-confirm', {
      phone: '+1555000',
      phoneCodeHash: 'h',
      code: '12345',
    }),
    200
  );
  assert.equal(
    await status('phone-change-confirm', {
      phone: '+1555000',
      phoneCodeHash: 'h',
      code: '',
    }),
    400
  );
  assert.equal(
    await status('phone-change-confirm', { phone: '+1555000', code: '12345' }),
    400
  );
  assert.equal(await status('data-export-start', request()), 200);
  assert.equal(
    await status('data-export-start', request({ formats: [] })),
    400
  );
  assert.equal(await status('data-export-start', {}), 400);
  assert.equal(await status('data-export-status', {}), 200);
  assert.equal(await status('data-export-cancel', {}), 200);
  assert.equal(await status('data-export-reveal', {}), 200);
  assert.equal(await status('account-ttl-set', { days: 548 }), 200);
  assert.equal(await status('account-ttl-set', { days: 730 }), 200);
  assert.equal(await status('account-ttl-set', { days: 7 }), 400);
  assert.equal(
    await status('data-export-status', {}).then(() => calls.at(-1)),
    'status'
  );
});

// ---- the page's helpers ---------------------------------------------------

test("the page's helpers", () => {
  assert.equal(cleanPhone(' +1 (555) 000-09 '), '+155500009');
  assert.equal(cleanPhone('12'), null);
  assert.equal(cleanPhone('abc'), null);
  const t = (key, vars) => `${key}:${vars?.count ?? ''}`;
  assert.equal(
    delayText(t, 90061),
    'dataExport.time.days:1 dataExport.time.hours:1'
  );
  assert.equal(delayText(t, 2400), 'dataExport.time.minutes:40');
  assert.equal(delayText(t, 5), 'dataExport.time.minutes:1');
  assert.equal(chatsPercent({ chatsTotal: 4, chatsDone: 1 }), 25);
  assert.equal(chatsPercent({ chatsTotal: null, chatsDone: 0 }), null);
  assert.equal(dataFormReady(DEFAULT_DATA_FORM), true);
  assert.equal(
    dataFormReady({
      ...DEFAULT_DATA_FORM,
      info: false,
      contacts: false,
      kinds: {
        ...DEFAULT_DATA_FORM.kinds,
        personal: false,
        privateGroups: false,
      },
    }),
    false
  );
  assert.equal(
    dataFormReady({ ...DEFAULT_DATA_FORM, sizeLimitMb: '0' }),
    false
  );
  const body = dataRequestOf({
    ...DEFAULT_DATA_FORM,
    format: 'both',
    sizeLimitMb: '12',
  });
  assert.deepEqual(body.formats, ['html', 'json']);
  assert.equal(body.sizeLimitMb, 12);
  assert.equal(body.from, null);
  assert.equal(parseDataExport(body).ok, true);
});
