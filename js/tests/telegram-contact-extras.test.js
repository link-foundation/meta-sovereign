// Contact extras (R-Y217): the source module with fake clients, the routes'
// strict validation, honest outcomes for writes that got no answer, and the
// pure page helpers (contact and phone links, Block user in Replies, which
// contacts get the note and photo buttons). Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createContactExtras,
  noteOf,
  validMsgId,
} from '../src/sources/telegram-contact-extras.js';
import { contactLinkOf } from '../src/web/contact-links.js';
import { blockBody } from '../src/web/chat-replies-block.js';
import {
  firstNameOf,
  offersContactExtras,
} from '../src/web/chat-contact-extras.js';
import { inviteHashOf } from '../src/web/chat-invite.js';
import {
  REPLIES_CHAT,
  canBlockFromReplies,
} from '../src/web/chat-selection.js';
import {
  CustomFile,
  named,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';

const Api = {
  TextWithEntities: named('TextWithEntities'),
  InputUser: named('InputUser'),
  Birthday: named('Birthday'),
  contacts: {
    UpdateContactNote: named('UpdateContactNote'),
    ExportContactToken: named('ExportContactToken'),
    ImportContactToken: named('ImportContactToken'),
    ResolvePhone: named('ResolvePhone'),
    GetSaved: named('GetSaved'),
    ResetSaved: named('ResetSaved'),
    BlockFromReplies: named('BlockFromReplies'),
  },
  photos: { UploadContactProfilePhoto: named('UploadContactProfilePhoto') },
  users: { SuggestBirthday: named('SuggestBirthday') },
};

const make = (answer, extra = {}) => {
  const log = [];
  const remembered = [];
  const dropped = [];
  const env = {
    importer: async () => ({ Api, helpers, CustomFile }),
    queue: { run: async (_k, _p, fn) => fn() },
    peers: { remember: (...a) => remembered.push(a) },
    connection: {
      withPeer: async (_c, chat, use) =>
        use({ userId: BigInt(chat), accessHash: 7n }),
    },
  };
  const client = fakeClient(answer, log);
  const actions = createContactExtras(env, {
    userClient: async () => client,
    uploads: {
      uploadOf: (t) =>
        t === 'a'.repeat(32) ? { path: '/x', name: 'p.jpg' } : null,
      dropUpload: async (t) => dropped.push(t),
    },
    ...extra,
  });
  return { actions, log, remembered, dropped };
};

const everything = (value) =>
  JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v));

test('every Api name the module uses is in layer 232', () => {
  const tl = readFileSync(
    new URL('../src/sources/telegram-api/layer-232.tl', import.meta.url),
    'utf8'
  );
  for (const method of [
    'contacts.updateContactNote',
    'contacts.exportContactToken',
    'contacts.importContactToken',
    'contacts.resolvePhone',
    'contacts.getSaved',
    'contacts.resetSaved',
    'contacts.blockFromReplies',
    'photos.uploadContactProfilePhoto',
    'users.suggestBirthday',
  ]) {
    assert.ok(tl.includes(`\n${method}#`), method);
  }
});

test('a note is trimmed, limited and sent for the right user', async () => {
  const { actions, log } = make(() => true);
  assert.deepEqual(await actions.contactNote({ chat: '5', note: ' hi ' }), {
    ok: true,
    note: 'hi',
  });
  assert.equal(log[0].note.text, 'hi');
  assert.equal(log[0].id.userId, 5n);
  for (const body of [
    { chat: 'x', note: 'a' },
    { chat: '5', note: 3 },
    { chat: '5', note: 'a'.repeat(129) },
  ]) {
    assert.equal((await actions.contactNote(body)).code, 'bad-request');
  }
  assert.equal(log.length, 1);
  assert.deepEqual(noteOf({ note: { text: 'n' }, personalPhoto: {} }), {
    note: 'n',
    personalPhoto: true,
  });
  assert.deepEqual(noteOf({}), {});
});

test('the share link, opening one, and a phone number', async () => {
  const { actions, remembered } = make((r) => {
    if (r.className === 'ExportContactToken') {
      return { url: 'https://t.me/contact/abc', expires: 1800000000 };
    }
    if (r.className === 'ImportContactToken') {
      return { id: 9n, firstName: 'Bo', lastName: 'Li' };
    }
    return r.phone === '15550000'
      ? { users: [{ id: 4n, username: 'zed' }] }
      : telegramError('PHONE_NOT_OCCUPIED');
  });
  assert.deepEqual(await actions.contactToken(), {
    ok: true,
    url: 'https://t.me/contact/abc',
    expires: 1800000000,
  });
  const opened = await actions.contactTokenOpen({ token: 'abc_-1' });
  assert.deepEqual(opened, { ok: true, found: true, chat: '9', name: 'Bo Li' });
  assert.equal(remembered.length, 1);
  assert.equal(
    (await actions.contactTokenOpen({ token: 'a b' })).code,
    'token-invalid'
  );
  const found = await actions.phoneResolve({ phone: '+15550000' });
  assert.deepEqual(found, { ok: true, found: true, chat: '4', name: 'zed' });
  assert.deepEqual(await actions.phoneResolve({ phone: '15551234' }), {
    ok: true,
    found: false,
  });
  assert.equal(
    (await actions.phoneResolve({ phone: '12' })).code,
    'phone-invalid'
  );
});

test('photos: save, suggest and reset; the upload is always dropped', async () => {
  const token = 'a'.repeat(32);
  const { actions, log, dropped } = make(() => ({}));
  assert.equal(
    (await actions.contactPhoto({ chat: '5', mode: 'save', token })).ok,
    true
  );
  assert.equal(log[0].save, true);
  assert.equal(log[0].suggest, undefined);
  await actions.contactPhoto({ chat: '5', mode: 'suggest', token });
  assert.equal(log[1].suggest, true);
  assert.equal(log[1].file.file.path, '/x');
  assert.deepEqual(await actions.contactPhoto({ chat: '5', mode: 'reset' }), {
    ok: true,
    mode: 'reset',
  });
  assert.equal(log[2].file, undefined);
  assert.equal(log[2].save, true);
  const gone = await actions.contactPhoto({
    chat: '5',
    mode: 'save',
    token: 'b'.repeat(32),
  });
  assert.equal(gone.code, 'photo-invalid');
  assert.equal(
    (await actions.contactPhoto({ chat: '5', mode: 'x' })).code,
    'bad-request'
  );
  assert.equal(dropped.length, 5);
  assert.equal(log.length, 3);
});

test('a suggested birthday is validated, then sent', async () => {
  const { actions, log } = make(() => ({}));
  assert.equal(
    (await actions.birthdaySuggest({ chat: '5', day: 31, month: 2 })).code,
    'birthday-invalid'
  );
  assert.equal(log.length, 0);
  assert.equal(
    (await actions.birthdaySuggest({ chat: '5', day: 3, month: 4, year: 1990 }))
      .ok,
    true
  );
  assert.equal(log[0].birthday.year, 1990);
  await actions.birthdaySuggest({ chat: '5', day: 3, month: 4 });
  assert.equal('year' in log[1].birthday, false);
});

test('synced contacts: the count, then the deletion', async () => {
  const { actions, log } = make((r) =>
    r.className === 'GetSaved' ? [{}, {}, {}] : true
  );
  assert.deepEqual(await actions.savedContacts(), { ok: true, count: 3 });
  assert.deepEqual(await actions.savedContactsReset(), { ok: true });
  assert.equal(log[1].className, 'ResetSaved');
});

test('Block user in Replies: only real flags are passed on', async () => {
  const { actions, log } = make(() => ({}));
  assert.equal(
    (await actions.blockFromReplies({ msgId: 0 })).code,
    'bad-request'
  );
  assert.equal(
    (await actions.blockFromReplies({ msgId: 3, reportSpam: 'yes' })).code,
    'bad-request'
  );
  assert.equal(log.length, 0);
  assert.equal(
    (
      await actions.blockFromReplies({
        msgId: 3,
        reportSpam: true,
        deleteHistory: false,
      })
    ).ok,
    true
  );
  assert.equal(log[0].msgId, 3);
  assert.equal(log[0].reportSpam, true);
  assert.equal('deleteHistory' in log[0], false);
  assert.equal(validMsgId(2 ** 31), false);
});

test('Telegram errors become codes; a write with no answer is unknown, never failed', async () => {
  const refused = make(() => telegramError('CONTACT_NOTE_INVALID'));
  const answer = await refused.actions.contactNote({
    chat: '5',
    note: 'secret note',
  });
  assert.equal(answer.code, 'note-invalid');
  assert.ok(!everything(answer).includes('secret note'));
  const dropped = make(() => new Error('Connection closed: secret note'));
  const unknown = await dropped.actions.contactNote({
    chat: '5',
    note: 'secret note',
  });
  assert.equal(unknown.code, 'send-unknown');
  assert.equal(unknown.outcome, 'unknown');
  assert.equal(unknown.fallback, false);
  assert.ok(!everything(unknown).includes('secret note'));
  // A read that got no answer is a plain failure, not "maybe done".
  const read = make(() => new Error('socket hang up'));
  assert.equal((await read.actions.savedContacts()).code, 'failed');
  const reset = make(() => new Error('socket hang up'));
  assert.equal((await reset.actions.savedContactsReset()).code, 'send-unknown');
});

test('the routes validate strictly and reach the account', async () => {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_t, name) => async (body) => {
        calls.push([name, body]);
        return { ok: true };
      },
    }
  );
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(await status('contact-note', { chat: 'x', note: '' }), 400);
  assert.equal(await status('contact-note', { chat: '5', note: '' }), 200);
  assert.equal(await status('contact-token-open', { token: 'a b' }), 400);
  assert.equal(await status('contact-token-open', { token: 'abc' }), 200);
  assert.equal(await status('phone-resolve', { phone: '1' }), 400);
  assert.equal(await status('phone-resolve', { phone: '+15550000' }), 200);
  assert.equal(await status('contact-photo', { chat: '5', mode: 'save' }), 400);
  assert.equal(
    await status('contact-photo', {
      chat: '5',
      mode: 'reset',
      token: 'a'.repeat(32),
    }),
    400
  );
  assert.equal(
    await status('contact-photo', { chat: '5', mode: 'reset' }),
    200
  );
  assert.equal(
    await status('birthday-suggest', { chat: '5', day: '3', month: 4 }),
    400
  );
  assert.equal(await status('block-from-replies', { msgId: 'x' }), 400);
  assert.equal(
    await status('block-from-replies', { msgId: 4, reportSpam: 1 }),
    400
  );
  assert.equal(await status('block-from-replies', { msgId: 4 }), 200);
  assert.equal(await status('saved-contacts-reset', {}), 200);
  assert.equal(calls.at(-1)[0], 'savedContactsReset');
});

test('links to a person: a shared contact and a phone number, nothing else', () => {
  assert.deepEqual(contactLinkOf('https://t.me/contact/abc_-1'), {
    token: 'abc_-1',
  });
  assert.deepEqual(contactLinkOf('tg://contact?token=xyz'), { token: 'xyz' });
  assert.deepEqual(contactLinkOf('https://t.me/+15550001122'), {
    phone: '15550001122',
  });
  assert.deepEqual(contactLinkOf('tg://resolve?phone=15550001122'), {
    phone: '15550001122',
  });
  for (const href of [
    'https://t.me/contact/a/b',
    'https://t.me/contact/',
    'https://evil.example/contact/abc',
    'https://u:p@t.me/contact/abc',
    'https://t.me/+AbCdEfGhIjKlMnOp',
    'tg://contact?token=a b',
    'javascript:alert(1)',
    '',
    null,
  ]) {
    assert.equal(contactLinkOf(href), null, String(href));
  }
  // Digits are a phone number, never an invite.
  assert.equal(inviteHashOf('https://t.me/+15550001122'), null);
  assert.equal(
    inviteHashOf('https://t.me/+AbCdEfGhIjKlMnOp'),
    'AbCdEfGhIjKlMnOp'
  );
});

test("Block user is offered in the Replies chat on others' messages only", () => {
  assert.deepEqual(blockBody(7, { reportSpam: true, deleteMessage: false }), {
    msgId: 7,
    reportSpam: true,
  });
  const chat = { source: 'telegram', chat: REPLIES_CHAT };
  const theirs = {
    source: 'telegram',
    id: 'msg:telegram:1271266957:7',
    sender: '9',
    raw: { id: 7 },
  };
  assert.equal(canBlockFromReplies(theirs, chat), true);
  assert.equal(canBlockFromReplies(theirs, { ...chat, chat: '5' }), false);
  assert.equal(
    canBlockFromReplies(theirs, { ...chat, source: 'email' }),
    false
  );
});

test('the note and photo buttons are for known people in the contacts', () => {
  const chat = { source: 'telegram', chat: '5', name: 'Ann Lee' };
  const info = { kind: 'user', contact: true };
  assert.equal(offersContactExtras(chat, info), true);
  assert.equal(offersContactExtras(chat, { ...info, self: true }), false);
  assert.equal(offersContactExtras(chat, { ...info, bot: true }), false);
  assert.equal(offersContactExtras(chat, { ...info, contact: false }), false);
  assert.equal(offersContactExtras({ ...chat, chat: '-100' }, info), false);
  assert.equal(firstNameOf(chat), 'Ann');
  assert.equal(firstNameOf({ chat: '5' }), '5');
});
