import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { vacancyModernFixture } from './vacancy-modern-fixture.mjs';

await serveNativeMcpFixture(vacancyModernFixture);
