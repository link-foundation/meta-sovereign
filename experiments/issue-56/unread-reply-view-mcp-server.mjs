import { unreadNoticeFixture } from './unread-notice-fixture.mjs';
import { runUnreadInspectionFixture } from './unread-inspection-server.mjs';

const options = { firstChat: 7, notices: { acknowledgements: 'reply' } };
const mode = (state) => {
  options.restoration = {
    restored: true,
    reason: 'checked',
    replyView: {
      state,
      chat: String(options.firstChat),
      messageId: `${options.firstChat}08`,
    },
  };
};
mode('revealed');
const env = await unreadNoticeFixture(options);
await runUnreadInspectionFixture(env, {
  pending: () => 0,
  handle(url) {
    if (url.pathname === '/mode') {
      const next = url.searchParams.get('value');
      if (!['revealed', 'unavailable'].includes(next)) {
        return false;
      }
      options.firstChat++;
      mode(next);
    }
    return true;
  },
});
