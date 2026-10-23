/**
 * The user's own Telegram profile, as Telegram Desktop's Settings → My
 * Account has it (R-Y136; learned, never copied):
 * - `myProfile()` — users.getFullUser of the user → `{ ok, id, firstName,
 *   lastName, about, username, phone, hasPhoto, aboutMax }` (the bio
 *   is 70 characters, 140 with Premium);
 * - `saveProfile({ firstName, lastName, about })` — account.updateProfile
 *   with only what is given;
 * - `checkUsername({ username })` → `{ ok, status }`, `status` being
 *   `available`, `taken` or `invalid` (account.checkUsername);
 * - `saveUsername({ username })` — account.updateUsername ('' removes it);
 * - `setProfilePhoto({ token })` — the page's upload as the photo
 *   (photos.uploadProfilePhoto); `removeProfilePhoto()` —
 *   photos.deletePhotos with the current photo.
 * A saved name or username also moves the account the status shows.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { uploadedFile } from './telegram-chat-edit.js';

export const ABOUT_MAX = 70;
export const ABOUT_MAX_PREMIUM = 140;
export const USERNAME = /^$|^[A-Za-z][A-Za-z0-9_]{3,31}$/;

// The stored sync state holds the account the status shows.
const SYNC_ID = 'sync:telegram';

const CODES = {
  FIRSTNAME_INVALID: 'name-invalid',
  ABOUT_TOO_LONG: 'about-too-long',
  USERNAME_INVALID: 'username-invalid',
  USERNAME_OCCUPIED: 'username-taken',
  USERNAME_PURCHASE_AVAILABLE: 'username-taken',
  PHOTO_INVALID: 'photo-invalid',
  PHOTO_EXT_INVALID: 'photo-invalid',
  IMAGE_PROCESS_FAILED: 'photo-invalid',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

const messageOf = (error) =>
  String(error?.errorMessage ?? error?.message ?? '');

// Telegram saying nothing changed is no failure.
const forgiving = (error) =>
  messageOf(error).includes('_NOT_MODIFIED') ? { ok: true } : failure(error);

const bad = (code) => ({ ok: false, error: code, code });
const length = (value) => Array.from(String(value)).length;
const textOf = (value) => String(value?.value ?? value);

// The account the status shows, moved to what was saved.
const refreshAccount = async (env, user) => {
  if (!user || typeof user !== 'object') {
    return;
  }
  try {
    const link = await env.store?.get?.(SYNC_ID);
    if (!link?.account) {
      return;
    }
    const account = { ...link.account };
    for (const key of ['firstName', 'lastName', 'username']) {
      if (user[key] !== undefined) {
        account[key] = user[key] ?? null;
      }
    }
    await env.store.put({ ...link, account });
  } catch {
    // the status is a convenience; the save stands
  }
};

// One request, through the queue.
const ask = (env, c, key, request) =>
  runIn(env, key, () => c.client.invoke(request));

const fullOf = async (env, c) => {
  const answer = await ask(
    env,
    c,
    'profile:me',
    new c.Api.users.GetFullUser({ id: new c.Api.InputUserSelf() })
  );
  const user =
    (answer?.users ?? []).find((u) => u?.self) ?? answer?.users?.[0] ?? {};
  return { full: answer?.fullUser ?? {}, user };
};

const hasPhoto = (full) =>
  Boolean(full.profilePhoto) && full.profilePhoto.className !== 'PhotoEmpty';

const readMine = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const { full, user } = await fullOf(env, c);
    return {
      ok: true,
      id: textOf(user.id ?? ''),
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      about: full.about ?? '',
      username: user.username ?? '',
      phone: user.phone ? `+${String(user.phone).replace(/^\+/, '')}` : '',
      hasPhoto: hasPhoto(full),
      aboutMax: user.premium ? ABOUT_MAX_PREMIUM : ABOUT_MAX,
    };
  });

// The code that refuses a save, or null.
const refusal = ({ firstName, lastName, about }) => {
  if (firstName !== undefined && length(firstName.trim()) < 1) {
    return 'name-invalid';
  }
  if ([firstName, lastName].some((n) => n !== undefined && length(n) > 64)) {
    return 'name-invalid';
  }
  return about !== undefined && length(about) > ABOUT_MAX_PREMIUM
    ? 'about-too-long'
    : null;
};

const saveMine =
  (env, userClient) =>
  async (request = {}) => {
    const fields = ['firstName', 'lastName', 'about'].filter(
      (k) => typeof request[k] === 'string'
    );
    const code = refusal(request);
    if (code || fields.length === 0) {
      return bad(code ?? 'failed');
    }
    return connected(env, userClient, forgiving, async (c) => {
      const user = await ask(
        env,
        c,
        'profile:save',
        new c.Api.account.UpdateProfile(
          Object.fromEntries(fields.map((k) => [k, request[k]]))
        )
      );
      await refreshAccount(env, user);
      return { ok: true };
    });
  };

// A refused check is an answer, not a failure.
const checked = (error) => {
  const found = failure(error);
  const status = { 'username-invalid': 'invalid', 'username-taken': 'taken' }[
    found.code
  ];
  if (messageOf(error).includes('_NOT_MODIFIED')) {
    return { ok: true, status: 'available' };
  }
  return status ? { ok: true, status } : found;
};

const checkName =
  (env, userClient) =>
  async (request = {}) => {
    const username = String(request.username ?? '');
    if (!USERNAME.test(username)) {
      return { ok: true, status: 'invalid' };
    }
    if (username === '') {
      return { ok: true, status: 'available' };
    }
    return connected(env, userClient, checked, async (c) => {
      const free = await ask(
        env,
        c,
        'profile:username-check',
        new c.Api.account.CheckUsername({ username })
      );
      return { ok: true, status: free ? 'available' : 'taken' };
    });
  };

const saveName =
  (env, userClient) =>
  async (request = {}) => {
    const username = String(request.username ?? '');
    if (!USERNAME.test(username)) {
      return bad('username-invalid');
    }
    return connected(env, userClient, forgiving, async (c) => {
      const user = await ask(
        env,
        c,
        'profile:username',
        new c.Api.account.UpdateUsername({ username })
      );
      await refreshAccount(env, user ?? { username: username || null });
      return { ok: true };
    });
  };

const setPhoto =
  (env, { userClient, uploads }) =>
  async (request = {}) => {
    const token = String(request.token ?? '');
    try {
      return await connected(env, userClient, failure, async (c) => {
        const file = await uploadedFile({ ...c, env }, uploads, token);
        if (!file) {
          return bad('photo-invalid');
        }
        await ask(
          env,
          c,
          'profile:photo',
          new c.Api.photos.UploadProfilePhoto({ file })
        );
        return { ok: true };
      });
    } finally {
      await uploads?.dropUpload?.(token);
    }
  };

// The current photo, asked for fresh (its file reference ages).
const removePhoto = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const { full } = await fullOf(env, c);
    const photo = hasPhoto(full) ? full.profilePhoto : null;
    if (photo) {
      await ask(
        env,
        c,
        'profile:photo',
        new c.Api.photos.DeletePhotos({
          id: [
            new c.Api.InputPhoto({
              id: photo.id,
              accessHash: photo.accessHash,
              fileReference: photo.fileReference,
            }),
          ],
        })
      );
    }
    return { ok: true };
  });

/** `context.uploads` has the page's uploads (`uploadOf`, `dropUpload`). */
export const createProfile = (env, context) => ({
  myProfile: readMine(env, context.userClient),
  saveProfile: saveMine(env, context.userClient),
  checkUsername: checkName(env, context.userClient),
  saveUsername: saveName(env, context.userClient),
  setProfilePhoto: setPhoto(env, context),
  removeProfilePhoto: removePhoto(env, context.userClient),
});
