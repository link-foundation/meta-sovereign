import {
  friendsAdapter,
  friendsServer,
  friendRelations,
} from './vk-friends-fixture.mjs';
export const maintenanceAdapter = (extra = {}) => {
  let accountId = 1;
  let mode = 'confirmed';
  const users = new Map([
    [8, 'banned'],
    [9, 'deleted'],
    [10, null],
    [11, 'banned'],
  ]);
  const relations = new Map([
    [8, 3],
    [9, 3],
    [10, 3],
    [11, 3],
    [12, 1],
    [13, 1],
    [14, 1],
  ]);
  const effects = [];
  const adapter = friendsAdapter({
    ...extra,
    methods: {
      'users.get': (params) =>
        params.user_ids
          ? [
              {
                id: Number(params.user_ids),
                ...(users.get(Number(params.user_ids))
                  ? { deactivated: users.get(Number(params.user_ids)) }
                  : {}),
              },
            ]
          : [{ id: accountId }],
      'friends.get': (params) => {
        const rows = [...relations]
          .filter(([, value]) => value === 3)
          .map(([id]) => ({
            id,
            ...(users.get(id) ? { deactivated: users.get(id) } : {}),
          }));
        return {
          count: rows.length,
          items: rows.slice(
            Number(params.offset ?? 0),
            Number(params.offset ?? 0) + Number(params.count)
          ),
        };
      },
      'friends.getRequests': (params) => {
        const ids = [...relations]
          .filter(([, relation]) => relation === (params.out === '1' ? 1 : 2))
          .map(([id]) => id);
        return {
          count: ids.length,
          items: ids.slice(
            Number(params.offset ?? 0),
            Number(params.offset ?? 0) + Number(params.count)
          ),
        };
      },
      'friends.areFriends': friendRelations(relations),
      'friends.delete': (params) => {
        const id = Number(params.user_id);
        effects.push(id);
        if (mode === 'refused') {
          return { error: { error_code: 29, error_msg: 'Fixture refusal' } };
        }
        if (mode === 'unknown') {
          throw new Error('Fixture deletion response lost');
        }
        if (mode === 'unconfirmed') {
          return { success: 1 };
        }
        const relation = relations.get(id);
        relations.set(id, 0);
        return {
          success: 1,
          [relation === 3 ? 'friend_deleted' : 'out_request_deleted']: 1,
        };
      },
      ...extra.methods,
    },
  });
  return {
    ...adapter,
    effects,
    relations,
    users,
    mode: (value) => {
      mode = value;
    },
    account: (value) => {
      accountId = value;
    },
  };
};
export const maintenanceServer = ({
  clock = {},
  adapter = maintenanceAdapter(),
  ...settings
} = {}) => {
  const options = {
    sleep: async () => {},
    ...clock,
    resolve: () => ({ live: adapter.live }),
    optionsFor: async () => ({ token: 'fixture-user-token' }),
  };
  return friendsServer({
    ...settings,
    adapter,
    vkMaintenance: { cleanup: options, outgoing: options },
  });
};
