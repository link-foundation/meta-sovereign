import { unreadModelFixture } from './unread-model-fixture.mjs';
import { runUnreadInspectionFixture } from './unread-inspection-server.mjs';
const env = await unreadModelFixture();
await runUnreadInspectionFixture(env, {
  pending: () => 0,
  handle: () => true,
  extraStats: () => ({ modelCalls: env.calls.length }),
});
