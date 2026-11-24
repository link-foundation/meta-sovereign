import { serveApplicationNativeMcp } from './application-native-mcp-server.mjs';

// Keep stdin open (a PTY), then send a line to drain all owned resources.
await serveApplicationNativeMcp({});
