/**
 * Search across Telegram, as Telegram's apps search from the chat list's
 * box (R-Y107; learned, never copied): people and chats by name or
 * username — the user's own first, then public ones (contacts.search) —
 * and messages in every chat (messages.searchGlobal), newest first, a
 * page at a time. What is found is stored as any read message or chat
 * is: a found chat opens at once, a found message is there to show.
 *
 * `searchPeers({ q })` → `{ ok, peers: [{ chat, name, username, kind,
 * members, mine }] }`;
 * `searchGlobal({ q, cursor? })` → `{ ok, messages, count, more, cursor }`
 * — `messages` the found ones as links, newest first; `cursor` asks for
 * the page after them.
 */

export const GLOBAL_PAGE = 30;
export const PEERS_LIMIT = 20;
export const MAX_GLOBAL_QUERY = 128;
const CURSORS = 64;

const queryOf = (q) =>
  String(q ?? '')
    .trim()
    .slice(0, MAX_GLOBAL_QUERY);

const usernameOf = (entity) =>
  entity?.username ??
  entity?.usernames?.find((u) => u?.active)?.username ??
  null;

const kindOf = (entity) => {
  if (entity?.className === 'User') {
    return entity.bot ? 'bot' : 'user';
  }
  return entity?.className === 'Channel' && !entity.megagroup
    ? 'channel'
    : 'group';
};

const nameOf = (entity) =>
  [entity?.firstName, entity?.lastName].filter(Boolean).join(' ') ||
  entity?.title ||
  usernameOf(entity) ||
  null;

// The users and chats of an answer, by their (marked) chat id.
const entitiesOf = (answer, utils) => {
  const entities = new Map();
  for (const entity of [...(answer?.users ?? []), ...(answer?.chats ?? [])]) {
    try {
      entities.set(String(utils.getPeerId(entity)), entity);
    } catch {
      // An entity GramJS cannot address is left out.
    }
  }
  return entities;
};

const peerIdOf = (utils, peer) => {
  try {
    return String(utils.getPeerId(peer));
  } catch {
    return null;
  }
};

// A link as the search answers it: what a row shows, not all Telegram said.
const slim = (link) => {
  const { raw: _raw, ...shown } = link;
  return shown;
};

// messages.searchGlobal from the start, or after the page `after` ended.
const globalRequest = (Api, query, after) =>
  new Api.messages.SearchGlobal({
    q: query,
    filter: new Api.InputMessagesFilterEmpty(),
    minDate: 0,
    maxDate: 0,
    offsetRate: after?.rate ?? 0,
    offsetPeer: after?.peer ?? new Api.InputPeerEmpty(),
    offsetId: after?.id ?? 0,
    limit: GLOBAL_PAGE,
  });

const realOf = (answer) =>
  (answer?.messages ?? []).filter(
    (m) => m && m.id !== undefined && m.className !== 'MessageEmpty'
  );

// How many Telegram counts in all (a page that is all there is: its own).
const countOf = (answer, list) => Number(answer?.count) || list.length;

// Where the next page starts, after the last message of this one.
const nextOf = (Api, answer, last) => ({
  rate: answer?.nextRate ?? last.date ?? 0,
  peer: last.inputChat ?? new Api.InputPeerEmpty(),
  id: last.id,
});

/**
 * `env` is the account's; `userClient()` the user client or null;
 * `tools` its `toLinks`, `writeChanged` and `dialogOfEntity`.
 */
export const createGlobalSearch = (env, { userClient, tools }) => {
  const cursors = new Map(); // token -> { rate, peer, id }
  let tokens = 0;

  const keepCursor = (state) => {
    const token = `c${(tokens += 1)}`;
    cursors.set(token, state);
    if (cursors.size > CURSORS) {
      cursors.delete(cursors.keys().next().value);
    }
    return token;
  };

  // A found chat is remembered: opening it reads it at once.
  const remember = async (chat, entity) => {
    const dialog = tools.dialogOfEntity(chat, entity);
    await env.peers?.remember(chat, entity, dialog);
    return dialog;
  };

  const searchPeers = async ({ q, priority = 'view' } = {}) => {
    const query = queryOf(q);
    const client = query ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api, utils } = await env.importer();
    const answer = await env.queue.run(`peers:${query}`, priority, () =>
      client.invoke(new Api.contacts.Search({ q: query, limit: PEERS_LIMIT }))
    );
    const entities = entitiesOf(answer, utils);
    const found = [
      ...(answer?.myResults ?? []).map((peer) => ({ peer, mine: true })),
      ...(answer?.results ?? []).map((peer) => ({ peer, mine: false })),
    ];
    const peers = [];
    const seen = new Set();
    for (const { peer, mine } of found) {
      const chat = peerIdOf(utils, peer);
      const entity = entities.get(chat);
      if (!entity || seen.has(chat)) {
        continue;
      }
      seen.add(chat);
      await remember(chat, entity);
      peers.push({
        chat,
        name: nameOf(entity),
        username: usernameOf(entity),
        kind: kindOf(entity),
        members: entity.participantsCount ?? null,
        mine,
      });
    }
    return { ok: true, peers };
  };

  // The found messages stored, chat by chat; their links in found order.
  const store = async (client, list, entities, utils) => {
    const byChat = new Map();
    for (const message of list) {
      try {
        message._finishInit?.(client, entities, undefined);
      } catch {
        // GramJS names the sender when it can; the chat list names it later.
      }
      const chat = peerIdOf(utils, message.peerId);
      if (chat) {
        byChat.set(chat, [...(byChat.get(chat) ?? []), message]);
      }
    }
    const links = new Map();
    for (const [chat, messages] of byChat) {
      const entity = entities.get(chat);
      const dialog =
        env.live?.chats?.get(chat) ??
        (entity ? await remember(chat, entity) : { id: chat });
      for (const link of tools.toLinks(dialog, messages)) {
        links.set(link.id, link);
      }
    }
    await tools.writeChanged(env.store, [...links.values()]);
    return list
      .map((m) =>
        links.get(`msg:telegram:${peerIdOf(utils, m.peerId)}:${m.id}`)
      )
      .filter(Boolean)
      .map(slim);
  };

  const searchGlobal = async ({ q, cursor = null, priority = 'view' } = {}) => {
    const query = queryOf(q);
    const client = query ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const after = cursor ? cursors.get(cursor) : null;
    if (cursor && !after) {
      return { ok: true, messages: [], count: 0, more: false, cursor: null };
    }
    const { Api, utils } = await env.importer();
    const answer = await env.queue.run(
      `global:${query}:${cursor ?? ''}`,
      priority,
      () => client.invoke(globalRequest(Api, query, after))
    );
    const list = realOf(answer);
    const entities = entitiesOf(answer, utils);
    const messages = await store(client, list, entities, utils);
    const more = list.length >= GLOBAL_PAGE;
    return {
      ok: true,
      messages,
      count: countOf(answer, list),
      more,
      cursor: more ? keepCursor(nextOf(Api, answer, list.at(-1))) : null,
    };
  };

  return { searchPeers, searchGlobal };
};
