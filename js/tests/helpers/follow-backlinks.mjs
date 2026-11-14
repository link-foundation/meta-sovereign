import { createMemoryStore } from '../../src/storage/universal.js';
import { createFollowBacklinks } from '../../src/follow/backlinks.js';
import { createBacklinkVk } from '../../src/follow/backlink-vk.js';
import { createVkLive } from '../../src/sources/vk.js';
import { buildMessageLink } from '../../src/sources/link.js';

export const backlinkInput = (extra = {}) => ({
  chats: ['2000000007'],
  backlink: 'https://t.me/study_group',
  monitorMs: 2000,
  intervalMs: 1000,
  deleteIncoming: true,
  retry: { attempts: 3, delayMs: 10, maxDelayMs: 20 },
  ...extra,
});
const incoming = (chat) => [
  { id: 1, peer_id: Number(chat), out: 0, text: 'An incoming link' },
  { id: 2, peer_id: Number(chat), out: 1, text: 'Keep outgoing' },
  {
    id: 3,
    peer_id: Number(chat),
    out: 0,
    action: { type: 'chat_title_update' },
  },
  { id: 4, peer_id: Number(chat), out: 0, text: 'Another incoming' },
];
export const followBacklinksFixture = async ({
  store = createMemoryStore(),
} = {}) => {
  await store.put({
    id: 'secret:vk:access-token',
    token: 'fixture-placeholder',
  });
  for (const row of incoming('2000000007')) {
    await store.put(
      buildMessageLink({
        source: 'vk',
        externalId: String(row.id),
        sender: String(row.out ? 7 : 8),
        chat: '2000000007',
        body: row.text ?? '',
        timestamp: '2026-11-10T00:00:00Z',
        outgoing: row.out === 1,
        service: Boolean(row.action),
        raw: row,
      })
    );
  }
  const state = {
    now: 100000,
    owner: 7,
    writable: true,
    nextId: 100,
    delivered: new Map(),
    incoming: new Map(
      incoming('2000000007').map((row) => [String(row.id), row])
    ),
    removed: false,
    skipNotice: false,
  };
  const calls = [];
  const sleeps = [];
  const fetchImpl = async (url, init) => {
    const method = new URL(url).pathname.split('/').pop();
    const params = Object.fromEntries(new URLSearchParams(init.body));
    const call = { method, params };
    calls.push(call);
    await state.before?.(call);
    let response;
    if (method === 'users.get') {
      response = [{ id: state.owner }];
    } else if (method === 'messages.getConversationsById') {
      response = {
        items: [
          {
            peer: { type: 'chat', id: Number(params.peer_ids) },
            chat_settings: { title: `Study circle ${params.peer_ids}` },
            can_write: { allowed: state.writable },
          },
        ],
      };
    } else if (method === 'messages.send') {
      const id = state.nextId++;
      state.delivered.set(String(id), {
        id,
        peer_id: Number(params.peer_id),
        out: 1,
        text: params.message,
      });
      response = id;
    } else if (method === 'messages.getById') {
      response = {
        items: state.removed
          ? []
          : params.message_ids
              .split(',')
              .map((id) => state.delivered.get(id) ?? state.incoming.get(id))
              .filter(Boolean),
      };
    } else if (method === 'messages.getHistory') {
      response = { items: incoming(params.peer_id) };
      state.incoming = new Map(
        response.items.map((row) => [String(row.id), row])
      );
      if (state.skipNotice) {
        response.items[0].text = 'ещё НЕ прошло 5 чужих ссылок';
      }
    } else if (method === 'messages.delete') {
      response = Object.fromEntries(
        params.message_ids.split(',').map((id) => [id, 1])
      );
    } else {
      throw new Error(`Unexpected fixture method ${method}`);
    }
    const override = await state.response?.(call, response);
    return new globalThis.Response(
      JSON.stringify({ response: override ?? response })
    );
  };
  const provider = () =>
    createBacklinkVk({
      store,
      liveFactory: (options) =>
        createVkLive({
          ...options,
          limiter: { wait: async () => state.wait?.() },
          fetchImpl,
        }),
    });
  const options = {
    store,
    provider,
    now: () => state.now,
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      await state.sleep?.(ms, signal);
      state.now += ms;
    },
  };
  const service = createFollowBacklinks(options);
  const post = async (extra) => {
    const preview = await service.preview(backlinkInput(extra));
    const job = await service.apply({ planId: preview.planId, confirm: true });
    await service.idle();
    return service.status({ jobId: job.id });
  };
  return { store, state, calls, sleeps, options, service, post };
};
