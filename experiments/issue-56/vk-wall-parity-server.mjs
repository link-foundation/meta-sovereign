import { serveWallInspection } from './vk-wall-fixture.mjs';
import { wallParityAdapter } from './vk-wall-parity-fixture.mjs';
const adapter = wallParityAdapter();
adapter.addPost(42, 'Add me as a friend: visible other author', { from_id: 2 });
await serveWallInspection({ adapter });
