import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { applicationResumeNativeFixture } from './application-resume-native-fixture.mjs';

await serveNativeMcpFixture((browser) =>
  applicationResumeNativeFixture(browser, { language: true })
);
