import { unreadAnswerFixture } from './unread-answer-fixture.mjs';
import { runUnreadInspectionFixture } from './unread-inspection-server.mjs';
const env = await unreadAnswerFixture();
await runUnreadInspectionFixture(env, { pending: () => 0, handle: () => true });
