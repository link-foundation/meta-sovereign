import { runUnreadInspectionFixture } from './unread-inspection-server.mjs';
import { unreadNoticeFixture } from './unread-notice-fixture.mjs';

// Counted public UI/service boundary; native ownership has its own Chrome probe.
let mode = 'normal';
let pending = 0;
let release;
const options = {
  firstChat: 100,
  notices: { acknowledgements: 'reply' },
  async issue({ chat, text }) {
    if (mode === 'unknown') {
      return {};
    }
    if (mode === 'stop') {
      pending++;
      try {
        await new Promise((resolve) => {
          release = resolve;
        });
      } finally {
        pending--;
        release = undefined;
      }
    }
    return { via: 'browser', source: 'hh', chat, text, messageId: `${chat}08` };
  },
  afterVisit() {
    if (mode === 'owner') {
      throw Object.assign(new Error('The owner returned.'), {
        code: 'browser-background-owner-active',
        restoration: { restored: false, reason: 'owner-active' },
      });
    }
  },
};
const env = await unreadNoticeFixture(options);
await runUnreadInspectionFixture(env, {
  pending: () => pending,
  beforeClose: () => release?.(),
  handle(url) {
    if (url.pathname === '/release') {
      release?.();
    }
    if (url.pathname === '/mode') {
      const next = url.searchParams.get('value');
      if (!['normal', 'unknown', 'owner', 'stop'].includes(next) || pending) {
        return false;
      }
      mode = next;
      options.firstChat++;
    }
    return true;
  },
});
