import { serveApplicationNativeMcp } from './application-native-mcp-server.mjs';

await serveApplicationNativeMcp({
  ownerAnswers: {
    experience: 'Actual owner answer',
    letter: 'Actual owner letter',
  },
});
