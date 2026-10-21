/**
 * Search in one chat, as Telegram's apps do it (R-Y98): Telegram is
 * asked (messages.search through GramJS's getMessages, the chat's every message, not only those the
 * page holds), newest first, a page at a time; the messages found are
 * stored as any read ones are, so the chat can show them at once.
 *
 * `searchChat({ chat, q, offsetId? })` → `{ ids, count, more }`: the
 * network ids found (newest first), how many Telegram counts in all,
 * and whether there are older ones (ask again with the last id).
 */

export const SEARCH_PAGE = 50;
export const MAX_QUERY = 256;

/**
 * `env` is the account's; `userClient()` the user client or null;
 * `dialogOf(chat)` the chat as listed; `tools` its `toLinks` and
 * `writeChanged`.
 */
export const createChatSearch = (env, { userClient, dialogOf, tools }) => {
  const searchChat = async ({ chat, q, offsetId = 0 } = {}) => {
    const query = String(q ?? '')
      .trim()
      .slice(0, MAX_QUERY);
    const client = chat && query ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const target = String(chat);
    const offset = Number(offsetId);
    // GramJS's getMessages with `search` is messages.search, its answer
    // built as history's is (senders named); `total` is Telegram's count.
    const found = await env.queue.run(
      `search:${target}:${query}:${offset}`,
      'view',
      () =>
        env.connection.withPeer(client, target, (peer) =>
          client.getMessages(peer, {
            search: query,
            limit: SEARCH_PAGE,
            ...(Number.isInteger(offset) && offset > 0
              ? { offsetId: offset }
              : {}),
          })
        )
    );
    const messages = [...(found ?? [])].filter(
      (m) => m && m.id !== undefined && m.className !== 'MessageEmpty'
    );
    await tools.writeChanged(
      env.store,
      tools.toLinks(await dialogOf(target), messages)
    );
    const ids = messages.map((m) => Number(m.id));
    const count = Number(found?.total ?? ids.length) || ids.length;
    return {
      ok: true,
      ids,
      count,
      // A full page: there may be older ones.
      more: ids.length === SEARCH_PAGE,
    };
  };
  return { searchChat };
};
