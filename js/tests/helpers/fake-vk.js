// A fake VK for tests (R-Z8): a `fetch` that answers the method API
// (`POST <base>/method/<name>`, form body) and the long poll URL, with no
// network. `methods[name](params, ctx)` returns the `response` value or
// `{ error: {...} }`; `poll(query, ctx)` returns the long poll answer.

export const FAKE_VK_BASE = 'https://vk.fake';
export const FAKE_VK_POLL = 'https://lp.vk.fake/im1';

const reply = (body, status = 200) => ({
  ok: status < 400,
  status,
  statusText: status < 400 ? 'OK' : 'Error',
  async text() {
    return JSON.stringify(body);
  },
  async json() {
    return body;
  },
});

// Rejects when the request is aborted, as a real long poll does.
const aborted = (signal) =>
  new Promise((_, reject) => {
    signal?.addEventListener('abort', () =>
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    );
  });

export const createFakeVk = ({ methods = {}, poll = null } = {}) => {
  const calls = [];
  const polls = [];
  const fetchImpl = async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.origin === new URL(FAKE_VK_POLL).origin) {
      const query = Object.fromEntries(target.searchParams.entries());
      polls.push(query);
      // By default: nothing new, answered at once for wait=0 and held until
      // the request is aborted otherwise, as VK holds a long poll.
      const idle =
        query.wait === '0' ? { ts: '1', updates: [] } : new Promise(() => {});
      const answer = poll ? poll(query, { polls }) : idle;
      return reply(await Promise.race([answer, aborted(init.signal)]));
    }
    const name = target.pathname.replace('/method/', '');
    const params = Object.fromEntries(new URLSearchParams(init.body).entries());
    calls.push({ name, params });
    const handler = methods[name];
    if (!handler) {
      return reply({ error: { error_code: 3, error_msg: `no ${name}` } });
    }
    const result = await handler(params, { calls });
    return reply(result?.error ? result : { response: result });
  };
  return { fetchImpl, calls, polls, baseUrl: FAKE_VK_BASE };
};

// A user token's usual methods; `extra` overrides or adds.
export const userMethods = (extra = {}) => ({
  'users.get': () => [{ id: 1, first_name: 'Me', last_name: 'Self' }],
  'messages.getLongPollServer': () => ({
    key: 'k1',
    server: 'lp.vk.fake/im1',
    ts: 100,
  }),
  ...extra,
});

export const message = (id, peer, text, extra = {}) => ({
  id,
  conversation_message_id: id,
  peer_id: peer,
  from_id: peer,
  date: 1700000000 + id,
  text,
  ...extra,
});
