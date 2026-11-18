import { serveApplicationNativeMcp } from './application-native-mcp-server.mjs';

await serveApplicationNativeMcp({
  vacancyIds: ['123', '456'],
  salary: (id) => (id === '123' ? 'от 400000 ₽' : 'от 600000 ₽'),
});
