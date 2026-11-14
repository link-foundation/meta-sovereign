import { followBacklinksFixture } from './follow-backlinks.mjs';
import { telegramBacklinksFixture } from './telegram-backlinks.mjs';
import { followTelegramFixture } from './follow-telegram.mjs';
import { createFollowJoining } from '../../src/follow/joining.js';
import { createFollowVkJoining } from '../../src/follow/join-vk.js';
import { createFollowBacklinks } from '../../src/follow/backlinks.js';

const vkJoiningFixture = (store) => {
  const joiningCalls = [];
  const joiningState = {
    owner: 7,
    members: new Set(['https://vk.me/join/own_invite']),
    nextId: 8,
    localIds: new Map([['https://vk.me/join/own_invite', 7]]),
  };
  const vkJoining = () =>
    createFollowVkJoining({
      store,
      liveFactory: () => ({
        callOnce: async (method, params, options) => {
          joiningCalls.push({ method, params, options });
          await joiningState.before?.(method, params);
          let answer;
          if (method === 'users.get') {
            answer = [{ id: joiningState.owner }];
          } else if (method === 'messages.getChatPreview') {
            answer = {
              preview: {
                title: params.link,
                admin_id: 1,
                is_member: joiningState.members.has(params.link),
                ...(joiningState.localIds.has(params.link)
                  ? { local_id: joiningState.localIds.get(params.link) }
                  : {}),
              },
            };
          } else if (method === 'messages.joinChatByInviteLink') {
            joiningState.members.add(params.link);
            if (!joiningState.localIds.has(params.link)) {
              joiningState.localIds.set(params.link, joiningState.nextId++);
            }
            answer = { chat_id: joiningState.localIds.get(params.link) };
          } else {
            throw new Error(`Unexpected join fixture method ${method}`);
          }
          const override = await joiningState.response?.(
            method,
            params,
            answer
          );
          return override === undefined ? answer : override;
        },
      }),
    });
  return { joiningCalls, joiningState, vkJoining };
};

export const followAutoFixture = async ({ store } = {}) => {
  const vk = await followBacklinksFixture({ store });
  const telegram = await telegramBacklinksFixture({ store: vk.store });
  const member = followTelegramFixture({ store: vk.store });
  member.state.owner = '7';
  const states = new Map([
    ['study_group', { id: 9n, member: true, muted: false, archived: false }],
    ['study_first', { id: 10n, member: false, muted: false, archived: false }],
    ['study_second', { id: 11n, member: false, muted: false, archived: false }],
  ]);
  const originalEntity = member.client.getEntity;
  member.client.getEntity = async (selector) => {
    const name = String(selector).replace(/^@/u, '');
    const state = states.get(name);
    if (!state) {
      throw new Error('Unexpected fixture target');
    }
    member.state.entity = {
      className: 'Channel',
      id: state.id,
      accessHash: 10n,
      title: name,
      username: name,
      megagroup: true,
    };
    Object.assign(member.state, {
      member: state.member,
      muted: state.muted,
      archived: state.archived,
    });
    return originalEntity();
  };
  const originalInvoke = member.client.invoke;
  member.client.invoke = async (...args) => {
    const answer = await originalInvoke(...args);
    const state = states.get(member.state.entity.username);
    Object.assign(state, {
      member: member.state.member,
      muted: member.state.muted,
      archived: member.state.archived,
    });
    return answer;
  };
  const { joiningCalls, joiningState, vkJoining } = vkJoiningFixture(vk.store);
  const state = {
    now: 100000,
    links: 'https://t.me/study_first https://vk.me/join/first_invite',
    scans: [],
    events: [],
  };
  const previousVk = vk.state.response;
  vk.state.response = async (call, answer) => {
    if (call.method === 'messages.getHistory') {
      state.scans.push(call.params.peer_id);
      answer.items[0].text = vk.state.skipNotice
        ? 'ещё НЕ прошло 5 чужих ссылок'
        : state.links;
      answer.items[1].text =
        'https://t.me/study_second https://vk.me/join/outgoing_invite';
    }
    return state.vkResponse
      ? state.vkResponse(call, answer)
      : previousVk?.(call, answer);
  };
  const previousTelegram = telegram.state.response;
  telegram.state.response = async (request, answer) => {
    if (request.className === 'messages.GetHistory') {
      state.scans.push('-7');
      answer.messages[0].message = state.links;
      answer.messages[1].message =
        'https://t.me/study_second https://vk.me/join/outgoing_invite';
    }
    return state.telegramResponse
      ? state.telegramResponse(request, answer)
      : previousTelegram?.(request, answer);
  };
  const account = {
    ...telegram.account,
    ...member.account,
    stop: async () => {
      await telegram.account.stop();
      await member.account.stop();
    },
  };
  const options = {
    store: vk.store,
    telegramAccount: account,
    provider: (source) =>
      source === 'vk' ? vk.options.provider() : account.followBacklinkAdapter(),
    joining: (source) =>
      source === 'vk'
        ? vkJoining()
        : createFollowJoining(
            { store: vk.store, telegramAccount: account },
            source
          ),
    now: () => state.now,
    sleep: async (ms, signal) => {
      await state.sleep?.(ms, signal);
      state.now += ms;
    },
  };
  const service = createFollowBacklinks(options);
  const input = (extra = {}) => ({
    source: 'vk',
    chats: ['2000000007'],
    backlink: 'https://t.me/study_group',
    monitorMs: 2000,
    intervalMs: 1000,
    deleteIncoming: false,
    autoFollow: { maxRetries: 2, maxLinks: 5, joinDelayMs: 0 },
    retry: { attempts: 3, delayMs: 10, maxDelayMs: 20 },
    ...extra,
  });
  const post = async (extra) => {
    const plan = await service.preview(input(extra));
    const queued = await service.apply({ planId: plan.planId, confirm: true });
    await service.idle();
    return service.status({ jobId: queued.id });
  };
  const close = async () => {
    await service.stop();
    await vk.service.stop();
    await telegram.service.stop();
    await account.stop();
  };
  return {
    vk,
    telegram,
    member,
    states,
    joiningCalls,
    joiningState,
    state,
    account,
    options,
    service,
    input,
    post,
    close,
  };
};
