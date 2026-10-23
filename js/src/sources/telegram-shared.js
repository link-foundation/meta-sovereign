/**
 * A chat's shared media, as the profile column of Telegram's apps lists
 * it (R-Y111): how many photos, videos, files, music, links, voice
 * messages and GIFs the chat has (messages.getSearchCounters), and each
 * kind's messages, newest first, a page at a time (messages.search with
 * the kind's filter, through GramJS's getMessages); the messages read
 * are stored as any read ones are.
 *
 * `sharedCounts({ chat })` → `{ ok, counts: { photos, … } }`;
 * `sharedMedia({ chat, kind, offsetId? })` → `{ ok, messages, count,
 * more, last }`: the messages as links, how many Telegram counts, whether
 * older ones remain (ask again with `last`).
 */

export const SHARED_PAGE = 40;

// Each kind and Telegram's filter for it, in the order the column lists.
export const SHARED_KINDS = Object.freeze({
  photos: 'InputMessagesFilterPhotos',
  videos: 'InputMessagesFilterVideo',
  files: 'InputMessagesFilterDocument',
  music: 'InputMessagesFilterMusic',
  links: 'InputMessagesFilterUrl',
  voice: 'InputMessagesFilterRoundVoice',
  gifs: 'InputMessagesFilterGif',
});

const KIND_OF = new Map(
  Object.entries(SHARED_KINDS).map(([kind, filter]) => [filter, kind])
);

/**
 * `env` is the account's; `userClient()` the user client or null;
 * `dialogOf(chat)` the chat as listed; `tools` its `toLinks` and
 * `writeChanged`.
 */
export const createSharedMedia = (env, { userClient, dialogOf, tools }) => {
  const sharedCounts = async ({ chat } = {}) => {
    const client = chat ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    const target = String(chat);
    const answer = await env.queue.run(`shared-counts:${target}`, 'view', () =>
      env.connection.withPeer(client, target, (peer) =>
        client.invoke(
          new Api.messages.GetSearchCounters({
            peer,
            filters: Object.values(SHARED_KINDS).map((name) => new Api[name]()),
          })
        )
      )
    );
    const counts = Object.fromEntries(
      Object.keys(SHARED_KINDS).map((kind) => [kind, 0])
    );
    for (const counter of answer ?? []) {
      const kind = KIND_OF.get(counter?.filter?.className);
      if (kind) {
        counts[kind] = Number(counter.count) || 0;
      }
    }
    return { ok: true, counts };
  };

  const sharedMedia = async ({ chat, kind, offsetId = 0 } = {}) => {
    const filter = Object.hasOwn(SHARED_KINDS, String(kind))
      ? SHARED_KINDS[kind]
      : null;
    const client = chat && filter ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    const target = String(chat);
    const offset = Number(offsetId);
    const found = await env.queue.run(
      `shared:${target}:${kind}:${offset}`,
      'view',
      () =>
        env.connection.withPeer(client, target, (peer) =>
          client.getMessages(peer, {
            filter: new Api[filter](),
            limit: SHARED_PAGE,
            ...(Number.isInteger(offset) && offset > 0
              ? { offsetId: offset }
              : {}),
          })
        )
    );
    const messages = [...(found ?? [])].filter(
      (m) => m && m.id !== undefined && m.className !== 'MessageEmpty'
    );
    const links = tools.toLinks(await dialogOf(target), messages);
    await tools.writeChanged(env.store, links);
    const last = messages.length ? Number(messages.at(-1).id) : 0;
    return {
      ok: true,
      messages: links,
      count: Number(found?.total ?? links.length) || links.length,
      // A full page: there may be older ones.
      more: messages.length === SHARED_PAGE,
      last,
    };
  };

  return { sharedCounts, sharedMedia };
};
