import { createChatUsers } from '../../src/sources/telegram-chat-users.js';
import { greetingSendFixture } from './greeting-send-fakes.mjs';
import { userOf, usersFinished } from './chat-users-fakes.mjs';
import { named } from './telegram-route.js';

export const groupGreetingFixture = async (options = {}) => {
  const f = await greetingSendFixture(options);
  const participants = options.participants ?? [userOf(2), userOf(3)];
  const waits = [];
  let closed = 0;
  let history = 0;
  for (const user of participants) {
    f.entities.set(String(user.id), user);
  }
  f.entities.set('-44', f.entities.get('@GreetingGroup'));
  const channel = {
    className: 'Channel',
    id: 45n,
    megagroup: true,
    title: 'Supergroup',
  };
  f.entities.set('@Supergroup', channel);
  f.entities.set('-10045', channel);
  f.c.Api.InputUser = named('InputUser');
  f.c.Api.users = { GetFullUser: named('GetFullUser') };
  f.client.iterParticipants = async function* () {
    try {
      if (options.memberError) {
        throw options.memberError;
      }
      yield* participants;
    } finally {
      closed += 1;
    }
  };
  f.client.iterMessages = () => {
    history += 1;
    throw new Error('history is disabled');
  };
  const invoke = f.client.invoke;
  f.client.invoke = async (request) => {
    if (request.className !== 'GetFullUser') {
      return invoke(request);
    }
    f.calls.push(request);
    const id = String(request.id.userId);
    if (options.fullUser) {
      return options.fullUser(id);
    }
    return { fullUser: { className: 'UserFull', id: BigInt(id) } };
  };
  f.env.sleep = async (ms) => {
    waits.push(ms);
    await options.sleep?.(ms);
  };
  const create = () => createChatUsers(f.env, f.context, options);
  return {
    ...f,
    account: create(),
    createUsers: create,
    participants,
    waits,
    closed: () => closed,
    history: () => history,
  };
};
export const groupScan = async (f, options = {}) => {
  const started = await f.account.chatUsersGreetingsStart({
    chat: '@GreetingGroup',
    ...options,
  });
  if (!started.ok) {
    throw new Error(`scan: ${started.code}`);
  }
  return usersFinished(f.account);
};
export const groupPlan = async (f, options = {}) => {
  const scan = await groupScan(f);
  const plan = await f.account.chatUsersGreetingsPreview({
    jobId: scan.job.id,
    ...options,
  });
  if (!plan.ok) {
    throw new Error(`preview: ${plan.code}`);
  }
  return plan;
};
export const groupApply = async (f, plan) => {
  const started = await f.account.chatUsersGreetingsApply({
    confirm: true,
    planId: plan.planId,
  });
  if (!started.ok) {
    throw new Error(`apply: ${started.code}`);
  }
  return usersFinished(f.account);
};
