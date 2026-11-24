import { serveApplicationNativeMcp } from './application-native-mcp-server.mjs';

await serveApplicationNativeMcp({
  instantApplication: true,
  alreadyDelivered: true,
});
