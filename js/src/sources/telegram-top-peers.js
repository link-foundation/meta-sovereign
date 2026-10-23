/**
 * Frequent contacts, as Telegram Desktop's search shows them when the
 * query is empty (R-Y207; learned, never copied):
 * - `topPeers()` — contacts.getTopPeers (correspondents) → `{ ok, enabled,
 *   peers: [{ chat, name, username, kind }] }`; `enabled` false when the
 *   user turned the list off.
 * - `removeTopPeer({ chat })` — contacts.resetTopPeerRating (correspondents).
 * - `setTopPeers({ enabled })` — contacts.toggleTopPeers.
 */

import {
  entitiesOf,
  kindOf,
  nameOf,
  peerIdOf,
  usernameOf,
} from './telegram-global.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

const failure = failureOf({ FLOOD_WAIT: 'flood' });
export const TOP_LIMIT = 10;
const CHAT = /^-?\d{1,20}$/;

const bad = { ok: false, error: 'bad-request', code: 'bad-request' };

// The correspondents category of an answer.
const correspondents = (answer) =>
  (answer?.categories ?? []).find((c) =>
    String(c?.category?.className ?? '').endsWith(
      'TopPeerCategoryCorrespondents'
    )
  );

/** The people of an answer, in Telegram's order: `[{ chat, entity }]`. */
export const peopleOf = (answer, utils) => {
  const entities = entitiesOf(answer, utils);
  const found = [];
  for (const top of correspondents(answer)?.peers ?? []) {
    const chat = peerIdOf(utils, top.peer);
    const entity = entities.get(chat);
    if (entity && !entity.self && !entity.deleted) {
      found.push({ chat, entity });
    }
  }
  return found;
};

const createTop = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const { utils } = await env.importer();
    const answer = await runIn(env, 'top-peers', () =>
      c.client.invoke(
        new c.Api.contacts.GetTopPeers({
          correspondents: true,
          offset: 0,
          limit: TOP_LIMIT,
          hash: c.zero,
        })
      )
    );
    if (String(answer?.className ?? '').endsWith('TopPeersDisabled')) {
      return { ok: true, enabled: false, peers: [] };
    }
    const peers = [];
    for (const { chat, entity } of peopleOf(answer, utils)) {
      await env.peers?.remember?.(chat, entity);
      peers.push({
        chat,
        name: nameOf(entity),
        username: usernameOf(entity),
        kind: kindOf(entity),
      });
    }
    return { ok: true, enabled: true, peers };
  });

const createRemove =
  (env, userClient) =>
  async ({ chat } = {}) => {
    if (!CHAT.test(String(chat ?? ''))) {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      await env.connection.withPeer(c.client, String(chat), (peer) =>
        c.client.invoke(
          new c.Api.contacts.ResetTopPeerRating({
            category: new c.Api.TopPeerCategoryCorrespondents(),
            peer,
          })
        )
      );
      return { ok: true };
    });
  };

const createToggle =
  (env, userClient) =>
  async ({ enabled } = {}) => {
    if (typeof enabled !== 'boolean') {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      await c.client.invoke(new c.Api.contacts.ToggleTopPeers({ enabled }));
      return { ok: true, enabled };
    });
  };

export const createTopPeers = (env, { userClient }) => ({
  topPeers: createTop(env, userClient),
  removeTopPeer: createRemove(env, userClient),
  setTopPeers: createToggle(env, userClient),
});
