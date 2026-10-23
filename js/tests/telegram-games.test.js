// HTML5 bot games (R-Y190): the high scores source with fake clients, the
// route's validation, a game's answer keeping only web links, and the
// pure helpers (the card's shape, the score line, the menu's offer).
// Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGames, scoresOf } from '../src/sources/telegram-games.js';
import { gameAnswerOf } from '../src/sources/telegram-bots.js';
import { pictureOf } from '../src/sources/telegram-media.js';
import { named, postRoute } from './helpers/telegram-route.js';
import { gameOf, parseMedia, serviceInfo } from '../src/web/message-parts.js';
import { menuItems } from '../src/web/chat-selection.js';
import {
  gameUrl,
  hasGameScores,
  hasPlayButton,
} from '../src/web/chat-games.js';

const Api = {
  messages: { GetGameHighScores: named('GetGameHighScores') },
  InputUserSelf: named('InputUserSelf'),
};

const make = ({ answer, fail = null } = {}) => {
  const log = [];
  const actions = createGames(
    {
      importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
      queue: { run: async (_k, _p, fn) => fn() },
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    {
      userClient: async () => ({
        invoke: async (request) => {
          log.push(request);
          if (fail) {
            throw Object.assign(new Error(fail), { errorMessage: fail });
          }
          return answer;
        },
      }),
    }
  );
  return { ...actions, log };
};

const answer = {
  scores: [
    { pos: 1, userId: 7n, score: 900 },
    { pos: 2, userId: 8n, score: 450 },
    { pos: 3, userId: 9n, score: 12 },
  ],
  users: [
    { id: 7n, firstName: 'Ann', lastName: 'Fake' },
    { id: 8n, username: 'bob', self: true },
  ],
};

test('high scores: position, name, score, and who is the user', async () => {
  const { gameHighScores, log } = make({ answer });
  const got = await gameHighScores({ chat: '-5', id: 4 });
  assert.equal(got.ok, true);
  assert.deepEqual(got.scores, [
    { pos: 1, user: '7', name: 'Ann Fake', score: 900, me: false },
    { pos: 2, user: '8', name: 'bob', score: 450, me: true },
    { pos: 3, user: '9', name: '9', score: 12, me: false },
  ]);
  assert.equal(log[0].className, 'GetGameHighScores');
  assert.deepEqual([log[0].peer, log[0].id], [{ chat: '-5' }, 4]);
  assert.equal(log[0].userId.className, 'InputUserSelf');
  assert.deepEqual(scoresOf(null), []);
});

test('high scores: Telegram errors become codes; bad input is refused', async () => {
  const gone = await make({ fail: 'MESSAGE_ID_INVALID' }).gameHighScores({
    chat: '5',
    id: 1,
  });
  assert.deepEqual([gone.ok, gone.code], [false, 'not-found']);
  const other = await make({ fail: 'BOOM' }).gameHighScores({
    chat: '5',
    id: 1,
  });
  assert.equal(other.code, 'failed');
  const { gameHighScores, log } = make({ answer });
  for (const bad of [{}, { chat: 'x', id: 1 }, { chat: '5', id: 0 }]) {
    assert.equal((await gameHighScores(bad)).ok, false);
  }
  assert.equal(log.length, 0);
});

test('route game-scores: validates the body, then asks the account', async () => {
  const asked = [];
  const account = {
    gameHighScores: async (args) => {
      asked.push(args);
      return { ok: true, scores: [] };
    },
  };
  assert.equal(
    await postRoute('game-scores', { chat: '-5', id: 3 }, account),
    200
  );
  assert.deepEqual(asked, [{ chat: '-5', id: 3 }]);
  for (const body of [
    {},
    { chat: '-5' },
    { chat: 'abc', id: 3 },
    { chat: '-5', id: 0 },
    { chat: '-5', id: '3' },
    { chat: '-5', id: 1.5 },
  ]) {
    assert.equal(await postRoute('game-scores', body, account), 400);
  }
  assert.equal(await postRoute('game-scores', { chat: '5', id: 1 }, {}), 400);
  assert.equal(asked.length, 1);
});

test('a game answer opens only web links', () => {
  const ok = gameAnswerOf({ url: 'https://game.test/play?x=1' });
  assert.equal(ok.url, 'https://game.test/play?x=1');
  assert.equal(
    gameAnswerOf({ url: 'HTTP://game.test/' }).url,
    'HTTP://game.test/'
  );
  for (const url of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'tg://resolve?domain=bot',
    'data:text/html,hi',
    '//evil.test/x',
  ]) {
    assert.equal(gameAnswerOf({ url }).url, null, url);
  }
  assert.equal(gameAnswerOf({ message: 'hi' }).url, null);
  assert.equal(gameAnswerOf({ message: 'hi' }).message, 'hi');
});

test('the page opens only web links of a game', () => {
  assert.equal(gameUrl(' https://a.test/g '), 'https://a.test/g');
  assert.equal(gameUrl('http://a.test/g'), 'http://a.test/g');
  for (const url of [
    'javascript:1',
    'file:///x',
    'tg://x',
    '',
    null,
    undefined,
  ]) {
    assert.equal(gameUrl(url), null);
  }
});

const photo = {
  id: 1n,
  sizes: [{ className: 'PhotoSize', type: 'm', w: 320, h: 160, size: 900 }],
};
const gameMedia = {
  className: 'MessageMediaGame',
  game: {
    shortName: 'lumber',
    title: 'Lumberjack',
    description: 'Chop the tree',
    photo,
  },
};

test('a game message is shaped as a card with its picture', () => {
  const card = parseMedia({ media: gameMedia });
  assert.equal(card.kind, 'game');
  assert.deepEqual(
    [card.title, card.description, card.shortName],
    ['Lumberjack', 'Chop the tree', 'lumber']
  );
  assert.equal(card.photo.kind, 'photo');
  assert.equal(card.photo.aspectRatio, 2);
  assert.equal(gameOf({ title: 'T' }).photo, null);
  assert.equal(gameOf(undefined).title, null);
  // The photo is downloadable by the message, as any photo.
  assert.equal(pictureOf({ media: gameMedia }, 'm').kind, 'photo');
});

const link = (n, fields) => ({
  id: `msg:telegram:-5:${n}`,
  source: 'telegram',
  chat: '-5',
  ...fields,
});

test('a score message: the player, the score and the game', () => {
  const game = link(4, { raw: { id: 4, media: gameMedia } });
  const score = link(9, {
    service: 'MessageActionGameScore',
    senderName: 'Ann',
    raw: {
      id: 9,
      action: { className: 'MessageActionGameScore', gameId: 1n, score: 120 },
      replyTo: { replyToMsgId: 4 },
    },
  });
  const named = serviceInfo(score, new Map([[game.id, game]]));
  assert.equal(named.key, 'chat.service.gameScore');
  assert.deepEqual(named.params, {
    user: 'Ann',
    score: 120,
    game: 'Lumberjack',
  });
  // The game message is not at hand: the line still tells the score.
  const bare = serviceInfo(score, new Map());
  assert.equal(bare.key, 'chat.service.gameScoreBare');
  assert.equal(bare.params.score, 120);
});

const keyboard = (...buttons) => ({
  className: 'ReplyInlineMarkup',
  rows: [{ className: 'KeyboardButtonRow', buttons }],
});

test('the menu offers High scores on a sent game only', () => {
  const game = link(4, { raw: { id: 4, media: gameMedia } });
  assert.equal(hasGameScores(game), true);
  assert.equal(hasGameScores({ ...game, pending: true }), false);
  assert.equal(hasGameScores(link(5, { raw: { id: 5 } })), false);
  assert.ok(menuItems({ message: game, chat: {} }).includes('gameScores'));
  assert.ok(
    !menuItems({ message: link(5, { raw: { id: 5 } }) }).includes('gameScores')
  );
});

test('the card shows its own Play only when the bot gave no button', () => {
  const play = { className: 'KeyboardButtonGame', text: 'Play Lumberjack' };
  const withButton = link(4, {
    raw: { id: 4, media: gameMedia, replyMarkup: keyboard(play) },
  });
  assert.equal(hasPlayButton(withButton), true);
  const forwarded = link(5, { raw: { id: 5, media: gameMedia } });
  assert.equal(hasPlayButton(forwarded), false);
  const other = link(6, {
    raw: {
      id: 6,
      media: gameMedia,
      replyMarkup: keyboard({
        className: 'KeyboardButtonUrl',
        text: 'x',
        url: 'https://a.test',
      }),
    },
  });
  assert.equal(hasPlayButton(other), false);
});
