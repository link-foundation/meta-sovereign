import { createMemoryStore } from '../../src/storage/universal.js';
import { createFollowDiscovery } from '../../src/follow/chat-discovery.js';

const group = (id, title, text) => ({
  conversation: {
    peer: { id: 2000000000 + id, type: 'chat', local_id: id },
    chat_settings: { title, members_count: 51, owner_id: 1, state: 'in' },
    can_write: { allowed: true },
  },
  last_message: { id: 100 + id, from_id: 2, date: 1794268800, text },
});
export const followChatsFixture = async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'secret:vk:access-token',
    tokens: ['secret', 'vk'],
    token: 'fixture-placeholder',
  });
  const calls = [];
  const conversations = [
    {
      conversation: { peer: { id: 12, type: 'user' } },
      last_message: { text: 'https://t.me/PrivatePerson' },
    },
    group(1, 'Neighbourhood', 'Meet on Saturday'),
    group(2, 'Telegram study group', 'Read the pinned instructions'),
    group(
      3,
      'Community announcements',
      'Our channel: https://t.me/Study_Group'
    ),
  ];
  const members = Array.from({ length: 51 }, (_, index) => ({
    member_id: index + 1,
    invited_by: 1,
    join_date: 1794268800,
    is_owner: index === 0,
    is_admin: index < 2,
  }));
  const profiles = members.map((member) => ({
    id: member.member_id,
    first_name: 'Member',
    last_name: String(member.member_id),
    screen_name: `member${member.member_id}`,
  }));
  const messages = [
    { id: 13, from_id: 2, date: 1794268800, text: 'Newest group message' },
    {
      id: 12,
      from_id: 1,
      date: 1794268700,
      text: 'Welcome to the study group',
    },
  ];
  const state = { error: null, malformed: null, factories: 0 };
  const call = async (method, params) => {
    calls.push({ method, params });
    if (state.error) {
      throw state.error;
    }
    if (state.malformed) {
      return state.malformed;
    }
    if (method === 'messages.getConversations') {
      return {
        count: conversations.length,
        items: conversations.slice(params.offset, params.offset + params.count),
      };
    }
    if (method === 'messages.getConversationsById') {
      const item = conversations.find(
        (item) => item.conversation.peer.id === Number(params.peer_ids)
      );
      return { count: item ? 1 : 0, items: item ? [item.conversation] : [] };
    }
    if (method === 'messages.getConversationMembers') {
      return {
        count: members.length,
        items: members.slice(params.offset, params.offset + params.count),
        profiles,
      };
    }
    if (method === 'messages.getHistory') {
      return { count: messages.length, items: messages.slice(0, params.count) };
    }
    throw new Error(`Unexpected fixture method: ${method}`);
  };
  const options = {
    liveFactory: () => {
      state.factories++;
      return {
        callOnce: async (method, params, options) => {
          await options.beforeIssue();
          return call(method, params);
        },
      };
    },
  };
  return {
    store,
    calls,
    conversations,
    state,
    options,
    discovery: createFollowDiscovery({ store, ...options }),
    serverOptions: { follow: options },
  };
};
