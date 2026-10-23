/**
 * Who a service message names (R-Y221; learned, never copied). A service
 * message holds only ids ("added 4711"); the names come in the same
 * answer from Telegram, in the message's entity map. `actionNamesOf`
 * reads that map for every person or chat the action names and gives
 * `{ <peer id>: { name, self } }` — a user by its id, a group by `-id`,
 * a channel by `-100id` — which the page words as "Ann added Bob" or
 * "Ann added you". It is kept with the message's `raw` as `actionNames`.
 */

const text = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

// The id fields an action names a person with, as a user id.
const USER_FIELDS = ['userId', 'inviterId', 'newCreatorId', 'botId'];
// The fields that hold a Peer, and the ones that hold a list of them.
const PEER_FIELDS = ['fromId', 'toId', 'peer', 'boostPeer'];
const PEER_LISTS = ['otherParticipants', 'peers'];

// The entity-map key of a Peer (as GramJS's `getPeerId` writes it).
const peerKey = (peer) => {
  if (peer?.userId !== undefined) {
    return text(peer.userId);
  }
  if (peer?.chatId !== undefined) {
    return `-${text(peer.chatId)}`;
  }
  return peer?.channelId === undefined ? '' : `-100${text(peer.channelId)}`;
};

const keysOf = (action) => {
  const keys = (action.users ?? []).map(text);
  for (const field of USER_FIELDS) {
    if (action[field] !== undefined && action[field] !== null) {
      keys.push(text(action[field]));
    }
  }
  const peers = PEER_FIELDS.map((f) => action[f]).concat(
    PEER_LISTS.flatMap((f) => action[f] ?? [])
  );
  return keys.concat(peers.map(peerKey)).filter(Boolean);
};

const nameOf = (entity) =>
  [entity.firstName, entity.lastName].filter(Boolean).join(' ') ||
  entity.title ||
  entity.username ||
  '';

/** `{ <peer id>: { name, self } }` for what a message's action names, or null. */
export const actionNamesOf = (message) => {
  const entities = message?._entities;
  if (!message?.action || typeof entities?.get !== 'function') {
    return null;
  }
  const out = {};
  for (const key of keysOf(message.action)) {
    const entity = entities.get(key);
    const name = entity ? nameOf(entity) : '';
    if (name || entity?.self) {
      out[key] = { name, self: Boolean(entity.self) };
    }
  }
  return Object.keys(out).length > 0 ? out : null;
};
