// Cloud themes and the per-chat translation switch (R-Y209): the source
// module with a fake client, the route validation and the page's pure
// helpers (links, stored choice, CSS tokens, mode). Nothing reaches a
// network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cloudPage,
  createCloudThemes,
} from '../src/sources/telegram-cloud-themes.js';
import {
  addthemeSlugOf,
  applicable,
  cardLook,
  cleanChoice,
  cleanTheme,
  cloudVars,
  modeOf,
} from '../src/web/cloud-theme-model.js';
import { named, postRoute } from './helpers/telegram-route.js';

const API = {
  InputTheme: named('InputTheme'),
  InputThemeSlug: named('InputThemeSlug'),
  account: Object.fromEntries(
    ['GetThemes', 'GetTheme', 'InstallTheme'].map((n) => [
      n,
      named(`account.${n}`),
    ])
  ),
  messages: {
    TogglePeerTranslations: named('messages.TogglePeerTranslations'),
  },
};

const makeEnv = (answers) => {
  const log = [];
  const env = {
    queue: { run: async (_k, _p, fn) => fn() },
    importer: async () => ({ Api: API, helpers: { returnBigInt: BigInt } }),
    connection: {
      withPeer: async (_client, chat, fn) => fn({ peerOf: chat }),
    },
  };
  const userClient = async () => ({
    invoke: async (request) => {
      log.push(request);
      const answer = answers[request.className];
      if (answer instanceof Error) {
        throw answer;
      }
      return typeof answer === 'function' ? answer(request) : (answer ?? true);
    },
  });
  return { env, userClient, log };
};

const settings = (base, accent, extra = {}) => ({
  className: 'ThemeSettings',
  baseTheme: { className: base },
  accentColor: accent,
  ...extra,
});
const theme = (slug, list, extra = {}) => ({
  className: 'Theme',
  id: 11n,
  accessHash: 22n,
  slug,
  title: `T ${slug}`,
  settings: list,
  ...extra,
});
const LIST = {
  className: 'account.Themes',
  hash: 77n,
  themes: [
    theme(
      'sunset',
      [
        settings('BaseThemeDay', 0xff8800, { outboxAccentColor: 0x112233 }),
        settings('BaseThemeNight', 0x00aaff, { messageColors: [0x334455] }),
      ],
      { creator: true }
    ),
    theme('file-only', []),
    { className: 'Theme', title: 'no slug', settings: [] },
  ],
};

test('cloudPage: ids as text, light and dark colours, none without a slug', () => {
  const page = cloudPage(LIST.themes[0]);
  assert.equal(page.id, '11');
  assert.equal(page.accessHash, '22');
  assert.equal(page.creator, true);
  assert.equal(page.light.accent, 0xff8800);
  assert.equal(page.dark.messages[0], 0x334455);
  const bare = cloudPage(LIST.themes[1]);
  assert.equal(bare.light, null);
  assert.equal(bare.dark, null);
  assert.equal(cloudPage(LIST.themes[2]), null);
  assert.equal(cloudPage(null), null);
});

test('cloudThemes: asked in the tdesktop format, kept, asked again with the hash', async () => {
  let answer = LIST;
  const { env, userClient, log } = makeEnv({
    'account.GetThemes': () => answer,
  });
  const actions = createCloudThemes(env, { userClient });
  const first = await actions.cloudThemes();
  assert.deepEqual(
    first.themes.map((th) => th.slug),
    ['sunset', 'file-only']
  );
  assert.equal(log[0].format, 'tdesktop');
  assert.equal(log[0].hash, 0n);
  await actions.cloudThemes();
  assert.equal(log.length, 1, 'kept for a while');
  answer = { className: 'account.ThemesNotModified' };
  const again = await actions.cloudThemes({ fresh: true });
  assert.equal(again.themes.length, 2);
  assert.equal(log.length, 2);
});

test('cloudTheme: one theme by the slug of its link', async () => {
  const { env, userClient, log } = makeEnv({
    'account.GetTheme': () => LIST.themes[0],
  });
  const actions = createCloudThemes(env, { userClient });
  const got = await actions.cloudTheme({ slug: 'sunset' });
  assert.equal(got.ok, true);
  assert.equal(got.theme.slug, 'sunset');
  assert.equal(log[0].theme.className, 'InputThemeSlug');
  assert.equal(log[0].theme.slug, 'sunset');
  assert.equal((await actions.cloudTheme({ slug: 'bad slug' })).ok, false);
  assert.equal(log.length, 1);
});

test('cloudTheme: an unknown slug becomes not-found', async () => {
  const fail = Object.assign(new Error('THEME_SLUG_INVALID'), {
    errorMessage: 'THEME_SLUG_INVALID',
  });
  const { env, userClient } = makeEnv({ 'account.GetTheme': fail });
  const actions = createCloudThemes(env, { userClient });
  assert.equal((await actions.cloudTheme({ slug: 'nope' })).code, 'not-found');
});

test('installCloudTheme: by id, by slug, or the default; bad input is not sent', async () => {
  const { env, userClient, log } = makeEnv({});
  const actions = createCloudThemes(env, { userClient });
  assert.deepEqual(
    await actions.installCloudTheme({ id: '11', accessHash: '22', dark: true }),
    { ok: true }
  );
  assert.equal(log[0].dark, true);
  assert.equal(log[0].theme.className, 'InputTheme');
  assert.equal(log[0].theme.id, 11n);
  await actions.installCloudTheme({ slug: 'sunset' });
  assert.equal(log[1].theme.className, 'InputThemeSlug');
  await actions.installCloudTheme({ reset: true });
  assert.equal(log[2].theme, undefined);
  assert.equal(
    (await actions.installCloudTheme({ id: 'x', accessHash: '1' })).ok,
    false
  );
  assert.equal(log.length, 3);
});

test('toggleTranslations: sent with the peer, validated first', async () => {
  const { env, userClient, log } = makeEnv({});
  const actions = createCloudThemes(env, { userClient });
  assert.deepEqual(
    await actions.toggleTranslations({ chat: '-100123', disabled: true }),
    { ok: true, disabled: true }
  );
  assert.equal(log[0].disabled, true);
  assert.deepEqual(log[0].peer, { peerOf: '-100123' });
  assert.equal(
    (await actions.toggleTranslations({ chat: 'x', disabled: true })).ok,
    false
  );
  assert.equal(
    (await actions.toggleTranslations({ chat: '5', disabled: 'yes' })).ok,
    false
  );
  assert.equal(log.length, 1);
});

test('routes validate their bodies before the account is asked', async () => {
  const calls = [];
  const note = (name) => async (a) => (calls.push([name, a]), { ok: true });
  const account = {
    cloudThemes: note('themes'),
    cloudTheme: note('theme'),
    installCloudTheme: note('install'),
    toggleTranslations: note('toggle'),
  };
  assert.equal(await postRoute('cloud-themes', {}, account), 200);
  assert.equal(await postRoute('cloud-themes', { fresh: 1 }, account), 400);
  assert.equal(
    await postRoute('cloud-theme', { slug: 'sunset' }, account),
    200
  );
  assert.equal(await postRoute('cloud-theme', { slug: 'a/b' }, account), 400);
  assert.equal(
    await postRoute(
      'cloud-theme-install',
      { id: '11', accessHash: '22', dark: false },
      account
    ),
    200
  );
  assert.equal(
    await postRoute('cloud-theme-install', { reset: true }, account),
    200
  );
  assert.equal(
    await postRoute('cloud-theme-install', { id: '11' }, account),
    400
  );
  assert.equal(
    await postRoute(
      'cloud-theme-install',
      { slug: 'sunset', dark: 'yes' },
      account
    ),
    400
  );
  assert.equal(
    await postRoute(
      'translations-toggle',
      { chat: '42', disabled: true },
      account
    ),
    200
  );
  assert.equal(
    await postRoute('translations-toggle', { chat: '42' }, account),
    400
  );
  assert.equal(
    await postRoute(
      'translations-toggle',
      { chat: 'a', disabled: true },
      account
    ),
    400
  );
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[4], ['toggle', { chat: '42', disabled: true }]);
});

test('addthemeSlugOf: t.me and tg:// links, nothing else', () => {
  assert.equal(addthemeSlugOf('https://t.me/addtheme/sunset'), 'sunset');
  assert.equal(addthemeSlugOf('https://telegram.me/addtheme/a_b-1/'), 'a_b-1');
  assert.equal(addthemeSlugOf('tg://addtheme?slug=sunset'), 'sunset');
  assert.equal(addthemeSlugOf('https://t.me/addlist/sunset'), null);
  assert.equal(addthemeSlugOf('https://evil.example/addtheme/sunset'), null);
  assert.equal(addthemeSlugOf('https://u:p@t.me/addtheme/sunset'), null);
  assert.equal(addthemeSlugOf('https://t.me/addtheme/a/b'), null);
  assert.equal(addthemeSlugOf('nonsense'), null);
});

const SUNSET = cleanTheme(cloudPage(LIST.themes[0]));

test('cleanTheme and cleanChoice: only what is ours survives', () => {
  assert.equal(SUNSET.slug, 'sunset');
  assert.equal(cleanTheme({ slug: 'bad slug' }), null);
  assert.equal(cleanTheme(null), null);
  assert.equal(cleanTheme({ slug: 'x', light: { accent: 'red' } }).light, null);
  assert.equal(applicable(cleanTheme(cloudPage(LIST.themes[1]))), false);
  assert.equal(cleanChoice({ theme: cleanTheme({ slug: 'x' }) }), null);
  const choice = cleanChoice({ theme: SUNSET, before: 'auto' });
  assert.equal(choice.before, 'auto');
  assert.equal(cleanChoice({ theme: SUNSET, before: 'odd' }).before, null);
});

test('cloudVars: accent and outgoing bubble for the mode asked', () => {
  const light = cloudVars(SUNSET, false);
  assert.equal(light['--accent'], '#ff8800');
  assert.equal(light['--chat-accent'], '#ff8800');
  assert.equal(light['--bubble-out'], '#112233');
  const dark = cloudVars(SUNSET, true);
  assert.equal(dark['--accent'], '#00aaff');
  assert.equal(dark['--bubble-out'], '#334455');
  assert.ok(dark['--bubble-out-text']);
  assert.deepEqual(cloudVars({ light: null, dark: null }, false), {});
});

test('modeOf: a one-sided theme forces its mode, a two-sided one does not', () => {
  assert.equal(modeOf(SUNSET), null);
  assert.equal(modeOf({ light: null, dark: SUNSET.dark }), 'dark');
  assert.equal(modeOf({ light: SUNSET.light, dark: null }), 'light');
  assert.equal(modeOf({ light: null, dark: null }), null);
});

test('cardLook: the ground follows the mode', () => {
  assert.equal(cardLook(SUNSET, true).accent, '#00aaff');
  assert.notEqual(
    cardLook(SUNSET, true).ground,
    cardLook(SUNSET, false).ground
  );
  assert.equal(cardLook({ light: null, dark: null }, true), null);
});
