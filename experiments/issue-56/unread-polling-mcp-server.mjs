import { unreadReviewFixture } from './question-unread-review-fixture.mjs';
import { runUnreadInspectionFixture } from './unread-inspection-server.mjs';

const env = await unreadReviewFixture();
await runUnreadInspectionFixture(env, { pending: () => 0, handle: () => true });
