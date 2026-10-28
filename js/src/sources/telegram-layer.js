/**
 * GramJS speaking Telegram's current API layer (R-Y76).
 *
 * GramJS builds every TL class from one schema text (`telegram/tl/apiTl.js`)
 * and names its layer when it connects (`AllTLObjects.LAYER`). Its copy
 * is older than Telegram's, and Telegram sends a client what its layer
 * cannot describe — checklists, polls since their new constructor, newer
 * media — as `messageMediaUnsupported`, which no later read can repair.
 * So before GramJS loads, its schema module is given the layer Telegram
 * publishes (./telegram-api/layer-N.tl, made by
 * js/scripts/telegram-schema.mjs), and its LAYER set to match.
 *
 * Anything going wrong here leaves GramJS as it was: older, but working.
 */

import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { configureTelegramCrypto } from './telegram-runtime.js';

export const LAYER = 232;

/**
 * The revision of the schema file at that layer (R-Y220). The repair that
 * reads unsupported messages again keeps its marker per layer *and*
 * revision, so a newly generated file (rich messages arrived at layer 232
 * after a first trial of it) makes the re-read run once more. Bump it
 * whenever layer-N.tl is regenerated.
 */
export const SCHEMA_REV = 2;

const SCHEMA = new URL(`./telegram-api/layer-${LAYER}.tl`, import.meta.url);

let installed = null;

/**
 * Give GramJS the newer schema; `{ layer, from? , error? }`. Must run
 * before the first `import('teleproto')`; later it only reports.
 */
export const installTelegramLayer = ({ schema = SCHEMA } = {}) => {
  configureTelegramCrypto();
  if (installed) {
    return installed;
  }
  try {
    const require = createRequire(import.meta.url);
    // Maintained teleproto ships generated classes at the current layer.
    // Keep the legacy schema repair for older GramJS installations.
    const current = require('teleproto/tl').LAYER;
    if (current >= LAYER) {
      installed = { layer: current, from: current };
      return installed;
    }
    const file = require.resolve('teleproto/tl/apiTl.js');
    if (require.cache[file]) {
      // GramJS was loaded first: its classes are already built.
      const { LAYER: current } = require('teleproto/tl/AllTLObjects.js');
      installed = { layer: current, error: 'telegram loaded before' };
      return installed;
    }
    const tl = readFileSync(schema, 'utf8');
    const seeded = new Module(file);
    seeded.filename = file;
    seeded.loaded = true;
    seeded.exports = tl;
    require.cache[file] = seeded;
    const all = require('teleproto/tl/AllTLObjects.js');
    const from = all.LAYER;
    all.LAYER = LAYER;
    installed = { layer: LAYER, from };
  } catch (error) {
    installed = { layer: null, error: String(error?.message ?? error) };
  }
  return installed;
};

// Dialogs that name no chat or person: a community (layer 232, R-Y220)
// is a `dialogCommunity` with a community id and no peer. GramJS builds
// every dialog from `dialog.peer`, so one such entry would fail the whole
// list; these are left out where the list is read.
export const peerDialogs = (dialogs) =>
  Array.isArray(dialogs) ? dialogs.filter((d) => d && d.peer) : dialogs;

const DIALOG_LISTS = ['Dialogs', 'DialogsSlice', 'PeerDialogs'];
const patched = new WeakSet();

// Run `fix(answer)` on every answer of `Class` GramJS reads.
const afterRead = (Class, fix) => {
  const read = Class?.fromReader;
  if (typeof read === 'function') {
    Class.fromReader = function fromReader(reader) {
      const answer = read.call(this, reader);
      fix(answer);
      return answer;
    };
  }
};

/** Make GramJS skip dialogs without a peer when it reads a dialog list. */
export const skipPeerlessDialogs = (Api) => {
  if (!Api?.messages || patched.has(Api)) {
    return;
  }
  patched.add(Api);
  for (const name of DIALOG_LISTS) {
    afterRead(Api.messages[name], (list) => {
      list.dialogs = peerDialogs(list.dialogs);
    });
  }
};

// Communities (layer 232, R-Y222): Telegram lists a `community` or
// `communityForbidden` among the `chats` of its answers, and GramJS's
// `getPeerId` / `getInputPeer` throw "Cannot cast Community to any kind
// of int" on them, failing the dialog sync and message reads. They are
// not shown, so they are dropped where an answer is read.
const COMMUNITIES = new Set(['Community', 'CommunityForbidden']);

export const withoutCommunities = (chats) =>
  Array.isArray(chats)
    ? chats.filter((c) => !COMMUNITIES.has(c?.className))
    : chats;

// The classes whose constructor has a `chats:Vector<Chat>` field, from
// the schema text: `messages.dialogsSlice` is `Api.messages.DialogsSlice`.
export const chatListClasses = (tl) =>
  tl
    .split('---functions---')[0]
    .split('\n')
    .filter((line) => line.includes(' chats:Vector<Chat>'))
    .map((line) => line.split('#')[0].split('.'));

const communitiesDropped = new WeakSet();

/** Make GramJS never see a community in an answer's `chats` (R-Y222). */
export const skipCommunities = (Api, tl) => {
  if (!Api || communitiesDropped.has(Api)) {
    return;
  }
  communitiesDropped.add(Api);
  for (const path of chatListClasses(tl)) {
    const name = path.pop();
    const Class = path.reduce((ns, part) => ns?.[part], Api)?.[
      name[0].toUpperCase() + name.slice(1)
    ];
    afterRead(Class, (answer) => {
      answer.chats = withoutCommunities(answer.chats);
    });
  }
};

// Layer 232 folded the button classes (`keyboardButtonUrl`, …) into a
// button's `type`. GramJS's message helpers still test a button against
// those classes when `message.buttons` is read, and testing against a class
// that does not exist throws. Empty stand-ins, which no
// button is ever an instance of, keep that harmless.
const OLD_BUTTONS = [
  'Url',
  'Callback',
  'RequestPhone',
  'RequestGeoLocation',
  'SwitchInline',
  'Game',
  'Buy',
  'UrlAuth',
  'RequestPoll',
  'UserProfile',
  'WebView',
  'SimpleWebView',
  'RequestPeer',
  'Copy',
];

export const quietOldButtons = (Api) => {
  for (const name of OLD_BUTTONS) {
    for (const prefix of ['KeyboardButton', 'InputKeyboardButton']) {
      if (Api && Api[`${prefix}${name}`] === undefined) {
        Api[`${prefix}${name}`] = class {};
      }
    }
  }
};

/** `import('teleproto')` at the current layer. */
export const importTelegram = async () => {
  installTelegramLayer();
  // Use the same CommonJS registry as the reader and layer probe. Deno's
  // npm import map can otherwise load a second copy with unpatched classes.
  const telegram = createRequire(import.meta.url)('teleproto');
  try {
    skipPeerlessDialogs(telegram.Api);
    skipCommunities(telegram.Api, readFileSync(SCHEMA, 'utf8'));
    quietOldButtons(telegram.Api);
  } catch {
    // GramJS stays as it was.
  }
  return telegram;
};
