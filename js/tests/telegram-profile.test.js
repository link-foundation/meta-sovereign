// The user's own Telegram profile (R-Y136): read with users.getFullUser,
// names and bio, the username checked and saved, the photo set and
// removed, Telegram's errors as codes, the account the status shows
// moved, and the routes' validation. Fake clients; no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createProfile } from '../src/sources/telegram-profile.js';
import {
  named,
  CustomFile,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';

const Api = {
  InputUserSelf: named('InputUserSelf'),
  InputPhoto: named('InputPhoto'),
  users: { GetFullUser: named('GetFullUser') },
  account: {
    UpdateProfile: named('UpdateProfile'),
    CheckUsername: named('CheckUsername'),
    UpdateUsername: named('UpdateUsername'),
  },
  photos: {
    UploadProfilePhoto: named('UploadProfilePhoto'),
    DeletePhotos: named('DeletePhotos'),
  },
};

const me = {
  self: true,
  id: 7n,
  firstName: 'Ann',
  lastName: 'Lee',
  username: 'annlee',
  phone: '15551234567',
  premium: false,
};
const photo = {
  className: 'Photo',
  id: 9n,
  accessHash: 8n,
  fileReference: 'r',
};
const full = (extra = {}) => ({
  fullUser: { about: 'Hello', profilePhoto: photo, ...extra.full },
  users: [{ ...me, ...extra.user }],
});

const make = (answer) => {
  const log = [];
  const dropped = [];
  const store = new Map([
    [
      'sync:telegram',
      { id: 'sync:telegram', account: { id: '7', username: 'annlee' } },
    ],
  ]);
  const client = fakeClient(answer, log);
  const env = {
    importer: async () => ({ Api, CustomFile, helpers }),
    store: {
      get: async (id) => store.get(id),
      put: async (link) => store.set(link.id, link),
    },
  };
  const actions = createProfile(env, {
    userClient: async () => client,
    uploads: {
      uploadOf: (token) =>
        token === 'tok' ? { path: '/x/data', name: 'a.png', size: 9 } : null,
      dropUpload: async (token) => dropped.push(token),
    },
  });
  return { actions, log, dropped, store };
};

const byDefault = (request) =>
  request.className === 'GetFullUser' ? full() : { ...me };

test('myProfile reads the user with users.getFullUser', async () => {
  const { actions, log } = make(byDefault);
  const mine = await actions.myProfile();
  assert.equal(log[0].className, 'GetFullUser');
  assert.equal(log[0].id.className, 'InputUserSelf');
  assert.deepEqual(mine, {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: 'Lee',
    about: 'Hello',
    username: 'annlee',
    phone: '+15551234567',
    hasPhoto: true,
    aboutMax: 70,
  });
});

test('Premium has a bio of 140; no photo means hasPhoto false', async () => {
  const { actions } = make(() =>
    full({ user: { premium: true }, full: { profilePhoto: undefined } })
  );
  const mine = await actions.myProfile();
  assert.equal(mine.aboutMax, 140);
  assert.equal(mine.hasPhoto, false);
});

test('saveProfile sends only what is given and moves the status', async () => {
  const { actions, log, store } = make(() => ({
    ...me,
    firstName: 'Anna',
    username: 'annlee',
  }));
  assert.deepEqual(await actions.saveProfile({ firstName: 'Anna' }), {
    ok: true,
  });
  assert.equal(log[0].className, 'UpdateProfile');
  assert.deepEqual(Object.keys(log[0]).sort(), ['className', 'firstName']);
  assert.equal(store.get('sync:telegram').account.firstName, 'Anna');
});

test('saveProfile refuses bad input and maps Telegram errors', async () => {
  const { actions, log } = make(() => telegramError('ABOUT_TOO_LONG'));
  assert.equal(
    (await actions.saveProfile({ firstName: ' ' })).code,
    'name-invalid'
  );
  assert.equal(
    (await actions.saveProfile({ about: 'x'.repeat(141) })).code,
    'about-too-long'
  );
  assert.equal((await actions.saveProfile({})).ok, false);
  assert.equal(log.length, 0);
  assert.equal(
    (await actions.saveProfile({ about: 'x' })).code,
    'about-too-long'
  );
  const bad = make(() => telegramError('FIRSTNAME_INVALID'));
  assert.equal(
    (await bad.actions.saveProfile({ firstName: 'A' })).code,
    'name-invalid'
  );
  const flood = make(() => telegramError('FLOOD_WAIT_30'));
  assert.equal((await flood.actions.saveProfile({ about: 'x' })).code, 'flood');
});

test('checkUsername says available, taken or invalid', async () => {
  const free = make(() => true);
  assert.deepEqual(await free.actions.checkUsername({ username: 'newname' }), {
    ok: true,
    status: 'available',
  });
  assert.equal(free.log[0].className, 'CheckUsername');
  assert.equal(free.log[0].username, 'newname');
  assert.equal(
    (await make(() => false).actions.checkUsername({ username: 'newname' }))
      .status,
    'taken'
  );
  for (const [error, status] of [
    ['USERNAME_OCCUPIED', 'taken'],
    ['USERNAME_PURCHASE_AVAILABLE', 'taken'],
    ['USERNAME_INVALID', 'invalid'],
    ['USERNAME_NOT_MODIFIED', 'available'],
  ]) {
    const got = await make(() => telegramError(error)).actions.checkUsername({
      username: 'newname',
    });
    assert.equal(got.status, status, error);
  }
  const local = make(() => true);
  assert.equal(
    (await local.actions.checkUsername({ username: '1ab' })).status,
    'invalid'
  );
  assert.equal(
    (await local.actions.checkUsername({ username: 'abc' })).status,
    'invalid'
  );
  assert.equal(
    (await local.actions.checkUsername({ username: '' })).status,
    'available'
  );
  assert.equal(local.log.length, 0);
});

test('saveUsername saves, removes with "", and moves the status', async () => {
  const { actions, log, store } = make(() => ({ ...me, username: 'newname' }));
  assert.deepEqual(await actions.saveUsername({ username: 'newname' }), {
    ok: true,
  });
  assert.equal(log[0].className, 'UpdateUsername');
  assert.equal(store.get('sync:telegram').account.username, 'newname');
  await actions.saveUsername({ username: '' });
  assert.equal(log[1].username, '');
  assert.equal(
    (await actions.saveUsername({ username: 'a b' })).code,
    'username-invalid'
  );
  assert.equal(log.length, 2);
});

test('saveUsername: not modified is success, taken is a code', async () => {
  const same = make(() => telegramError('USERNAME_NOT_MODIFIED'));
  assert.equal(
    (await same.actions.saveUsername({ username: 'annlee' })).ok,
    true
  );
  const taken = make(() => telegramError('USERNAME_OCCUPIED'));
  assert.equal(
    (await taken.actions.saveUsername({ username: 'someone' })).code,
    'username-taken'
  );
});

test('setProfilePhoto uploads the page file and drops it', async () => {
  const { actions, log, dropped } = make(() => ({ className: 'photos.Photo' }));
  assert.deepEqual(await actions.setProfilePhoto({ token: 'tok' }), {
    ok: true,
  });
  assert.equal(log[0].className, 'UploadProfilePhoto');
  assert.equal(log[0].file.className, 'InputFile');
  assert.equal(log[0].file.file.path, '/x/data');
  assert.deepEqual(dropped, ['tok']);
  const none = await actions.setProfilePhoto({ token: 'nope' });
  assert.equal(none.code, 'photo-invalid');
  const bad = make(() => telegramError('PHOTO_INVALID'));
  assert.equal(
    (await bad.actions.setProfilePhoto({ token: 'tok' })).code,
    'photo-invalid'
  );
});

test('removeProfilePhoto deletes the current photo by InputPhoto', async () => {
  const { actions, log } = make(byDefault);
  assert.deepEqual(await actions.removeProfilePhoto(), { ok: true });
  const [, del] = log;
  assert.equal(del.className, 'DeletePhotos');
  assert.equal(del.id[0].className, 'InputPhoto');
  assert.equal(del.id[0].id, 9n);
  assert.equal(del.id[0].fileReference, 'r');
  const none = make(() => full({ full: { profilePhoto: undefined } }));
  assert.deepEqual(await none.actions.removeProfilePhoto(), { ok: true });
  assert.equal(none.log.length, 1);
});

test('not connected: supported false', async () => {
  const actions = createProfile(
    { importer: async () => ({ Api, helpers }) },
    { userClient: async () => null }
  );
  assert.equal((await actions.myProfile()).supported, false);
});

test('the routes validate and pass on', async () => {
  const seen = [];
  const note = (name) => async (r) => (seen.push([name, r]), { ok: true });
  const account = {
    myProfile: note('profile'),
    saveProfile: note('save'),
    checkUsername: note('check'),
    saveUsername: note('username'),
    setProfilePhoto: note('photo'),
    removeProfilePhoto: note('remove'),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  const token = 'a'.repeat(32);
  assert.equal(await status('profile', {}), 200);
  assert.equal(
    await status('profile-save', { firstName: 'A', about: 'x' }),
    200
  );
  assert.equal(await status('profile-save', {}), 400);
  assert.equal(await status('profile-save', { firstName: '' }), 400);
  assert.equal(
    await status('profile-save', { firstName: 'x'.repeat(65) }),
    400
  );
  assert.equal(await status('profile-save', { lastName: '' }), 200);
  assert.equal(await status('profile-save', { lastName: 'x'.repeat(65) }), 400);
  assert.equal(await status('profile-save', { about: 'x'.repeat(141) }), 400);
  assert.equal(await status('profile-save', { about: 5 }), 400);
  assert.equal(await status('username-check', { username: 'abcde' }), 200);
  assert.equal(await status('username-check', { username: 'abc' }), 400);
  assert.equal(await status('username-check', { username: '9abcde' }), 400);
  assert.equal(
    await status('username-check', { username: 'a'.repeat(33) }),
    400
  );
  assert.equal(await status('username-check', {}), 400);
  assert.equal(await status('username-save', { username: '' }), 200);
  assert.equal(await status('username-save', { username: 'ab-cd' }), 400);
  assert.equal(await status('profile-photo', { token }), 200);
  assert.equal(await status('profile-photo', { remove: true }), 200);
  assert.equal(await status('profile-photo', { token: 'bad' }), 400);
  assert.equal(await status('profile-photo', {}), 400);
  assert.equal(await status('profile-photo', { remove: true, token }), 400);
  assert.deepEqual(
    seen.map(([name]) => name),
    ['profile', 'save', 'save', 'check', 'username', 'photo', 'remove']
  );
  assert.deepEqual(seen.at(-2)[1], { token });
});
