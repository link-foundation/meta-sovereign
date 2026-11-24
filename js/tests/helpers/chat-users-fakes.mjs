import { createMemoryStore } from '../../src/storage/universal.js';
import { createChatUsers } from '../../src/sources/telegram-chat-users.js';
import { named } from './telegram-route.js';

export const userOf = (id, patch = {}) => ({
  className: 'User',
  id: BigInt(id),
  firstName: `Person ${id}`,
  ...patch,
});
export const usersApi = {
  InputUser: named('InputUser'),
  contacts: { AddContact: named('AddContact') },
};
export const usersFixture = ({
  participants = [userOf(2), userOf(3)],
  messages = [],
  profiles = [],
  memberError,
  invoke,
  now,
  store = createMemoryStore(),
  sleep = async () => {},
} = {}) => {
  const calls = [];
  const waits = [];
  const identities = new Map(
    [...participants, ...profiles].map((user) => [String(user.id), user])
  );
  let me = userOf(1, { self: true });
  let closed = 0;
  const iterator = async function* (items, error) {
    try {
      if (error) {
        throw error;
      }
      yield* items;
    } finally {
      closed += 1;
    }
  };
  const client = {
    getMe: async () => me,
    getEntity: async (value) => {
      calls.push(['entity', String(value)]);
      if (String(value).startsWith('-')) {
        return { className: 'Chat', id: 44n, title: 'Study group' };
      }
      const user = String(value).startsWith('@')
        ? [...identities.values()].find(
            (entry) => entry.username === String(value).slice(1)
          )
        : identities.get(String(value));
      if (!user) {
        throw new Error('unavailable');
      }
      return user;
    },
    getInputEntity: async (id) => ({
      className: 'InputPeerUser',
      userId: id,
      accessHash: 88n,
    }),
    iterParticipants: () => iterator(participants, memberError),
    iterMessages: () => iterator(messages),
    invoke: async (request) => {
      calls.push(request);
      return invoke ? invoke(request) : { className: 'Updates', updates: [] };
    },
  };
  const env = {
    store,
    importer: async () => ({
      Api: usersApi,
      helpers: { returnBigInt: (value) => BigInt(value) },
    }),
    sleep: async (ms) => {
      waits.push(ms);
      await sleep(ms);
    },
    log: (event) => calls.push(['log', event]),
  };
  const account = createChatUsers(
    env,
    { userClient: async () => client },
    now ? { now } : {}
  );
  return {
    env,
    store,
    account,
    client,
    calls,
    waits,
    identities,
    setMe: (value) => {
      me = value;
    },
    closed: () => closed,
  };
};
export const usersFinished = async (account) => {
  for (let i = 0; i < 1000; i += 1) {
    const result = await account.chatUsersStatus();
    if (!['running', 'cancelling'].includes(result.job?.state)) {
      return result;
    }
    await new Promise((resolve) => globalThis.setImmediate(resolve));
  }
  throw new Error('users fixture did not finish');
};
export const scannedUsers = async (fixture, options = {}) => {
  const started = await fixture.account.chatUsersStart({
    chat: '-44',
    ...options,
  });
  if (!started.ok) {
    throw new Error(`start: ${started.code}`);
  }
  return usersFinished(fixture.account);
};
export const contactPlan = async (fixture, options = {}) => {
  const { job } = await scannedUsers(fixture);
  return fixture.account.chatUsersContactsPreview({
    jobId: job.id,
    ...options,
  });
};
export const appliedUsers = async (fixture, options = {}) => {
  const plan = await contactPlan(fixture, options);
  const started = await fixture.account.chatUsersContactsApply({
    planId: plan.planId,
    confirm: true,
  });
  if (!started.ok) {
    throw new Error(`apply: ${started.code}`);
  }
  return usersFinished(fixture.account);
};
