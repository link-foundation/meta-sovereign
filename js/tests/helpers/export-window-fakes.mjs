// Strict read-only provider fixture: both history directions and separate peer
// ID spaces. Every unexpected method fails instead of reaching a real account.
import { Api, fakeClient, msg, USERS } from './export-fakes.mjs';
import { named } from './telegram-route.js';

export const windowApi = {
  ...Api,
  channels: { GetFullChannel: named('GetFullChannel') },
};
export const at = (id, hours, extra = {}) =>
  msg(id, 1, {
    date: Date.UTC(2026, 0, 1) / 1000 + hours * 3600,
    message: `Message ${id}`,
    ...extra,
  });

export const windowClient = (
  histories,
  { beforeHistory, onDownload, migrated = {} } = {}
) => {
  const requests = [];
  const downloads = fakeClient([], { onDownload });
  return {
    requests,
    client: {
      ...downloads.client,
      getEntity: async (target) => {
        if (target !== '@export_team') {
          throw new Error('USERNAME_NOT_OCCUPIED');
        }
        return { className: 'Channel', id: 99n, title: 'Export team' };
      },
      invoke: async (request) => {
        requests.push(request);
        const chat = (request.peer ?? request.channel)?.chat;
        if (request.className === 'GetFullChannel') {
          return {
            fullChat: { migratedFromChatId: migrated[chat] },
            chats: [],
            users: [],
          };
        }
        if (request.className !== 'GetHistory') {
          throw new Error(`Unexpected provider write: ${request.className}`);
        }
        await beforeHistory?.(request);
        if (!(chat in histories)) {
          throw new Error('CHANNEL_PRIVATE');
        }
        const all = [...histories[chat]].sort((a, b) => a.id - b.id);
        const eligible = all.filter(
          (m) =>
            (!request.minId || m.id > request.minId) &&
            (!request.maxId || m.id < request.maxId)
        );
        const messages =
          request.addOffset < 0
            ? eligible
                .filter((m) =>
                  request.offsetId
                    ? m.id >= request.offsetId
                    : m.date >= request.offsetDate
                )
                .slice(0, request.limit)
                .reverse()
            : eligible
                .filter((m) => !request.offsetId || m.id < request.offsetId)
                .reverse()
                .slice(0, request.limit);
        return {
          count: all.length,
          messages,
          users: USERS,
          chats: [
            {
              className: 'Channel',
              id: '99',
              title: 'Export team',
              megagroup: true,
            },
          ],
        };
      },
    },
  };
};
