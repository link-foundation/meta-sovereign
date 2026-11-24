import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { applicationSearchAttachmentFixture } from './application-search-attachment-fixture.mjs';

let active;
await serveNativeMcpFixture(
  async (browser) => {
    active = await applicationSearchAttachmentFixture(browser, {
      ownerDraft: true,
    });
    return active;
  },
  () => ({ searches: active.searches })
);
