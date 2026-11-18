import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { salaryLadderBrowserFixture } from './salary-ladder-browser-fixture.mjs';

await serveNativeMcpFixture(salaryLadderBrowserFixture);
