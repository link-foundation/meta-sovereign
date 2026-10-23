// HTML5 bot games (R-Y190): the high scores of a game message. Playing is
// a bot button's press (POST /api/telegram/bot-callback with `game`).
//
// Its routes:
//   POST /api/telegram/game-scores {chat, id} -> { ok, scores: [{ pos,
//                       user, name, score, me }] } best first; posting a
//                       score is for bots only and has no route

const CHAT = /^-?\d{1,20}$/;

export const GAMES_POSTS = {
  'game-scores': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    Number.isInteger(body.id) &&
    body.id > 0 &&
    typeof account.gameHighScores === 'function'
      ? [200, await account.gameHighScores({ chat: body.chat, id: body.id })]
      : [400, { error: 'chat and id required', code: 'bad-request' }],
};
