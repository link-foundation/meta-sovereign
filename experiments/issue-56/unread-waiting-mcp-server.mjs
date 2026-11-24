import { unreadAnswerFixture } from './unread-answer-fixture.mjs';
import { runUnreadInspectionFixture } from './unread-inspection-server.mjs';

let pending = 0;
const env = await unreadAnswerFixture({ rows: [{}, {}] });
const scan = env.send.scanUnreadConversations.bind(env.send);
env.send.scanUnreadConversations = async (options) => {
  pending++;
  try {
    return await scan(options);
  } finally {
    pending--;
  }
};

await runUnreadInspectionFixture(env, {
  pending: () => pending,
  handle: () => true,
  extraStats: () => ({
    waitingPasses: env.state.scans.filter(({ watchWaiting }) => watchWaiting)
      .length,
  }),
});
