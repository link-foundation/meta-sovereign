// R-Z9: personal WhatsApp done honestly. Fakes only: no browser, no network,
// no real WhatsApp.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';

import { assertMode } from './helpers/mode.js';
import { getSource } from '../src/sources/index.js';
import {
  archiveChatId,
  chatIdOf,
  chatNameFromFile,
  toE164,
} from '../src/sources/whatsapp-ids.js';
import { importWhatsAppFile } from '../src/sources/whatsapp-file.js';
import { createWhatsAppWebSignIn } from '../src/sources/whatsapp-web-signin.js';
import {
  WEB_UIS,
  createBrowserSender,
  createDefaultSender,
} from '../src/sources/browser-sender.js';
import { createWhatsAppCloudLive } from '../src/sources/whatsapp.js';
import { guardedSend, transientStore } from '../src/automation/outbox.js';
import { createMemoryStore } from '../src/storage/index.js';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/whatsapp/${name}`, import.meta.url), 'utf8');
const parse = (archive) => getSource('whatsapp').parseArchive(archive);
// The export is the phone's local clock, read in this machine's zone.
const local = (y, mo, d, h, mi, se) =>
  new Date(y, mo - 1, d, h, mi, se).toISOString();
const clock = () => new Date(local(2026, 10, 11, 12, 0, 0));

test('Android 24-hour, day-first: multi-line, system, media, ids', async () => {
  const links = await parse({
    text: fixture('android-24h-dmy.txt'),
    fileName: 'WhatsApp Chat with Team Q4.txt',
  });
  const [e2e, created, hello, media, attached, edited, deleted, s1, s2] = links;
  assert.equal(e2e.service, 'notice');
  assert.equal(created.service, 'notice', 'a quote makes it a system line');
  assert.equal(created.body.includes('Team: Q4'), true);
  assert.equal(hello.sender, 'Anna');
  assert.equal(
    hello.body,
    'Hello all\nsecond line of Anna\n\nfourth line after a blank one'
  );
  assert.equal(hello.timestamp, local(2026, 10, 25, 14, 33, 0));
  assert.equal(media.attachments[0].omitted, true);
  assert.equal(attached.attachments[0].name, 'IMG-20261025-WA0001.jpg');
  assert.equal(attached.attachments[0].type, 'image');
  assert.equal(attached.body, 'look at this');
  assert.equal(edited.edited, true);
  assert.equal(edited.body, 'Anna changed the subject: nope');
  assert.equal(deleted.deleted, true);
  assert.equal(links.length, 9);
  // Same minute, same sender: the index tells them apart.
  assert.notEqual(s1.id, s2.id);
  assert.equal(new Set(links.map((l) => l.id)).size, links.length);
  assert.equal(hello.chatType, 'private_group');
  assert.equal(hello.chat, archiveChatId('Team Q4'));
});

test('Android 12-hour, month-first (a day above 12 settles it)', async () => {
  const links = await parse(fixture('android-12h-mdy.txt'));
  assert.deepEqual(
    links.map((l) => l.timestamp),
    [
      local(2026, 10, 12, 14, 32, 0),
      local(2026, 10, 13, 14, 33, 0),
      local(2026, 10, 13, 23, 59, 0),
      local(2026, 10, 14, 0, 5, 0),
    ]
  );
});

test('an all-ambiguous file takes the order that keeps time moving forward', async () => {
  const links = await parse(fixture('ambiguous-mdy.txt'));
  assert.deepEqual(
    links.map((l) => {
      const d = new Date(l.timestamp);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }),
    ['2026-11-01', '2026-11-02', '2026-12-01']
  );
});

test('iOS 24-hour: BOM, direction marks, dots, attached file', async () => {
  const links = await parse({
    text: fixture('ios-24h.txt'),
    fileName: 'WhatsApp Chat - Anna.txt',
    files: ['_chat.txt', '00000012-PHOTO-2026-10-25-14-33-00.jpg'],
  });
  assert.equal(links.length, 3);
  assert.equal(links[0].body, 'Hallo\nzweite Zeile');
  assert.equal(links[0].timestamp, local(2026, 10, 25, 14, 32, 11));
  assert.deepEqual(links[1].attachments[0], {
    type: 'image',
    name: '00000012-PHOTO-2026-10-25-14-33-00.jpg',
    file: '00000012-PHOTO-2026-10-25-14-33-00.jpg',
    omitted: false,
  });
  assert.equal(links[0].chatType, 'personal_chat');
});

test('iOS 12-hour and the old ISO style both parse', async () => {
  const ios = await parse(fixture('ios-12h.txt'));
  assert.equal(ios[0].timestamp, local(2026, 10, 25, 14, 32, 11));
  const iso = await parse('[2026-04-30, 14:32:11] Alice: Hello!');
  assert.equal(iso[0].timestamp, local(2026, 4, 30, 14, 32, 11));
  assert.equal(iso[0].sender, 'Alice');
});

test('narrow no-break space before AM/PM is understood', async () => {
  const [m] = await parse('1/30/26, 1:05 PM - Kim: ok');
  assert.equal(m.timestamp, local(2026, 1, 30, 13, 5, 0));
});

test('ids are deterministic and an overlapping re-import repeats them', async () => {
  const text = fixture('android-24h-dmy.txt');
  const a = await parse({ text, fileName: 'WhatsApp Chat with Team Q4.txt' });
  const b = await parse({ text, fileName: 'WhatsApp Chat with Team Q4.txt' });
  assert.deepEqual(
    a.map((l) => l.id),
    b.map((l) => l.id)
  );
  // The same chat exported again with an earlier message dropped keeps
  // the ids of the messages that remain.
  const shorter = text.split('\n').slice(2).join('\n');
  const c = await parse({
    text: shorter,
    fileName: 'WhatsApp Chat with Team Q4.txt',
  });
  const ids = new Set(a.map((l) => l.id));
  assert.equal(
    c.every((l) => ids.has(l.id)),
    true
  );
});

test('chat ids: E.164 number, group JID, hash of the name only as a fallback', () => {
  assert.equal(toE164('+49 (170) 123-4567'), '+491701234567');
  assert.equal(chatIdOf('491701234567@c.us'), '+491701234567');
  assert.equal(chatIdOf('491701234567:12@s.whatsapp.net'), '+491701234567');
  assert.equal(chatIdOf('120363-1623456789@g.us'), '120363-1623456789@g.us');
  assert.equal(chatIdOf('Anna'), null);
  assert.equal(
    chatNameFromFile('WhatsApp Chat with +49 170 1234567.txt'),
    '+49 170 1234567'
  );
  assert.equal(
    archiveChatId('WhatsApp Chat with +49 170 1234567'.slice(19)),
    '+491701234567'
  );
  assert.equal(archiveChatId('Anna  Petrova'), archiveChatId('anna petrova'));
  assert.match(archiveChatId('Anna'), /^name:[0-9a-z]+$/);
  assert.notEqual(archiveChatId('Anna'), archiveChatId('Bob'));
  assert.equal(chatNameFromFile('_chat.txt'), null);
});

// A stored-entries zip, enough for readZipEntries.
const zipOf = (entries) => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data, method = 0] of entries) {
    const raw = Buffer.from(data);
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
};

test('a zip export: chat named after the zip, media names map to entries', async () => {
  const store = createMemoryStore();
  const zip = zipOf([
    ['_chat.txt', fixture('ios-24h.txt'), 8],
    ['00000012-PHOTO-2026-10-25-14-33-00.jpg', 'jpegbytes'],
  ]);
  const report = await importWhatsAppFile(
    store,
    'WhatsApp Chat - Anna.zip',
    zip
  );
  assert.equal(report.imported, 3);
  assert.equal(report.chat, archiveChatId('Anna'));
  const links = await store.query((l) => l.id?.startsWith('msg:whatsapp:'));
  const photo = links.find((l) => l.attachments?.length);
  assert.equal(
    photo.attachments[0].file,
    '00000012-PHOTO-2026-10-25-14-33-00.jpg'
  );
  // Importing the same file again adds nothing.
  await importWhatsAppFile(store, 'WhatsApp Chat - Anna.zip', zip);
  const again = await store.query((l) => l.id?.startsWith('msg:whatsapp:'));
  assert.equal(again.length, links.length);
  await assert.rejects(
    importWhatsAppFile(store, 'x.zip', zipOf([['a.jpg', 'x']])),
    /no chat/
  );
});

// --- Web chat ids ---------------------------------------------------------

test('WhatsApp Web data-id patterns: group ids keep the message, not the participant', () => {
  const { idPattern, chatPattern } = WEB_UIS.whatsapp.messages;
  const group = 'false_120363-1623456789@g.us_3EB0ABCDEF_4917@c.us';
  assert.equal(new RegExp(idPattern).exec(group)[1], '3EB0ABCDEF');
  assert.equal(
    new RegExp(chatPattern).exec(group)[1],
    '120363-1623456789@g.us'
  );
  const one = 'true_491701234567@c.us_3EB0ABC';
  assert.equal(new RegExp(idPattern).exec(one)[1], '3EB0ABC');
  assert.equal(chatIdOf(new RegExp(chatPattern).exec(one)[1]), '+491701234567');
});

test('WhatsApp Web will not open a group or a title by digits of its name', () => {
  const url = WEB_UIS.whatsapp.chatUrl;
  for (const bad of ['120363-1623456789@g.us', 'title:Anna 2', 'Anna']) {
    assert.throws(() => url(bad), { code: 'unsupported-target' });
  }
  assert.equal(
    url('+49 170 1234567'),
    'https://web.whatsapp.com/send?phone=491701234567'
  );
});

const waCommander = (rows) => {
  const present = [
    WEB_UIS.whatsapp.loggedIn.split(',')[0].trim(),
    WEB_UIS.whatsapp.composer.split(',')[0].trim(),
    WEB_UIS.whatsapp.send.selector.split(',')[0].trim(),
  ];
  const calls = [];
  return {
    calls,
    goto: async ({ url }) => calls.push(['goto', url]),
    count: async ({ selector }) => (present.includes(selector) ? 1 : 0),
    clickButton: async ({ selector }) => calls.push(['click', selector]),
    typeText: async ({ text }) => calls.push(['type', text]),
    pressKey: async ({ key }) => calls.push(['press', key]),
    evaluate: async () => rows ?? [],
  };
};

const quick = { loginTimeoutMs: 0, pollMs: 0, clock };

test('readRecent keys messages by the number, the same on every pull', async () => {
  const row = {
    id: 'ABC',
    chat: '491701234567@c.us',
    sender: '',
    body: 'hi',
    time: null,
    timestamp: null,
    outgoing: false,
  };
  const make = () =>
    createBrowserSender({
      openSession: async () => ({ commander: waCommander([row]), close() {} }),
      ...quick,
    });
  const [a] = await make().readRecent({
    source: 'whatsapp',
    to: '+49 170 1234567',
  });
  const [b] = await make().readRecent({
    source: 'whatsapp',
    to: '491701234567',
  });
  assert.equal(a.chat, '+491701234567');
  assert.equal(a.id, 'msg:whatsapp:+491701234567:ABC');
  assert.equal(a.id, b.id);
});

// --- Automated personal sends are refused ---------------------------------

test('an automated WhatsApp send never reaches the browser: unsupported', async () => {
  const commander = waCommander();
  let opened = 0;
  const send = createDefaultSender({
    getSource: () => ({
      live: createWhatsAppCloudLive({ fetchImpl: async () => assert.fail() }),
    }),
    optionsFor: async () => ({}),
    browser: {
      openSession: async () => {
        opened += 1;
        return { commander, close() {} };
      },
      ...quick,
    },
  });
  const store = transientStore();
  const outcome = await guardedSend({
    store,
    kind: 'automation',
    owner: 'rule-1',
    draft: { source: 'whatsapp', chat: '+491701234567', text: 'hello' },
    send,
  });
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.code, 'unsupported');
  assert.match(outcome.error, /automated/);
  assert.equal(opened, 0);
  assert.deepEqual(commander.calls, []);
});

test('a send the user confirmed still goes through the browser', async () => {
  const commander = waCommander();
  const send = createDefaultSender({
    getSource: () => ({ live: createWhatsAppCloudLive({}) }),
    optionsFor: async () => ({}),
    browser: {
      openSession: async () => ({ commander, close() {} }),
      ...quick,
    },
  });
  const outcome = await guardedSend({
    store: transientStore(),
    kind: 'reengage',
    owner: 'reengage',
    userConfirmed: true,
    draft: { source: 'whatsapp', chat: '+491701234567', text: 'hello' },
    send,
  });
  assert.equal(outcome.status, 'sent');
  assert.equal(outcome.result.via, 'browser');
  assert.equal(commander.calls[0][0], 'goto');
});

test('Cloud API post: automated without credentials is unsupported; with them it sends', async () => {
  const live = createWhatsAppCloudLive({
    fetchImpl: async () => new globalThis.Response('{}', { status: 200 }),
  });
  await assert.rejects(
    live.post({ to: '1555', text: 'x' }, { automated: true }),
    { code: 'unsupported' }
  );
  await assert.rejects(live.post({ to: '1555', text: 'x' }), (e) => {
    assert.notEqual(e.code, 'unsupported');
    return true;
  });
  const sent = await live.post(
    { to: '1555', text: 'x' },
    { automated: true, token: 'T', phoneNumberId: '9' }
  );
  assert.ok(sent);
});

// --- Sign-in window -------------------------------------------------------

const fakeSignInSession = (state) => {
  const calls = [];
  return {
    calls,
    open: async (options) => {
      calls.push(['open', options]);
      return {
        commander: {
          goto: async ({ url }) => calls.push(['goto', url]),
          count: async () => {
            if (state.closedByUser) {
              throw new Error('Target closed');
            }
            return state.signedIn ? 1 : 0;
          },
        },
        close: async () => calls.push(['close']),
      };
    },
  };
};

test('sign-in opens a visible window in the store profile (0700) and sees the chat list', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wa-signin-'));
  const state = { signedIn: false };
  const fake = fakeSignInSession(state);
  const signIn = createWhatsAppWebSignIn({
    storeDir: dir,
    openSession: fake.open,
    pollMs: 1,
    settleMs: 0,
    clock,
  });
  const started = await signIn.start();
  assert.equal(started.state, 'waiting');
  assert.equal(started.signedIn, false);
  const [, options] = fake.calls[0];
  assert.equal(options.headless, false, 'never hidden');
  assert.equal(
    options.profileDir,
    path.join(dir, 'browser-profiles', 'whatsapp')
  );
  await assertMode(options.profileDir, 0o700);
  assert.deepEqual(fake.calls[1], ['goto', 'https://web.whatsapp.com/']);
  // Only the page is watched: nothing is clicked or typed.
  assert.equal(
    fake.calls.some(([k]) => ['click', 'type'].includes(k)),
    false
  );
  // A second start does not open a second window.
  await signIn.start();
  assert.equal(fake.calls.filter(([k]) => k === 'open').length, 1);

  state.signedIn = true;
  await signIn.done();
  const done = await signIn.status();
  assert.equal(done.signedIn, true);
  assert.equal(done.open, false);
  assert.equal(done.signedInAt, clock().toISOString());
  assert.equal(fake.calls.at(-1)[0], 'close');
  // A new controller (a restart) still knows it, from the owner-only marker.
  const again = createWhatsAppWebSignIn({
    storeDir: dir,
    openSession: fake.open,
  });
  assert.equal((await again.status()).signedIn, true);
  await assertMode(
    path.join(dir, 'browser-profiles', 'whatsapp-signed-in.json'),
    0o600
  );
});

test('closing the window is reported as not signed in; a missing browser is an error', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wa-signin-'));
  const state = { signedIn: false, closedByUser: false };
  const fake = fakeSignInSession(state);
  const signIn = createWhatsAppWebSignIn({
    storeDir: dir,
    openSession: fake.open,
    pollMs: 1,
  });
  await signIn.start();
  state.closedByUser = true;
  await signIn.done();
  const status = await signIn.status();
  assert.equal(status.open, false);
  assert.equal(status.signedIn, false);
  assert.equal(
    existsSync(path.join(dir, 'browser-profiles', 'whatsapp-signed-in.json')),
    false
  );

  const broken = createWhatsAppWebSignIn({
    storeDir: dir,
    openSession: async () => {
      throw Object.assign(new Error('install playwright'), {
        code: 'browser-unavailable',
      });
    },
  });
  await assert.rejects(broken.start(), { code: 'browser-unavailable' });
  assert.equal((await broken.status()).state, 'closed');
});
