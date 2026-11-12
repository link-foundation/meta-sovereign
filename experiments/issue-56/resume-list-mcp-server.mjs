import { createServer } from 'node:http';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import { resumeListFixture } from './resume-list-fixture.mjs';

// A counted read boundary keeps independent MCP UI verification within the host budget.
// Actual native DOM/commander reads have their separate production browser scenarios.
let reads = 0;
const options = [];
const server = await startServer({
  localUi: true,
  port: 0,
  tls: false,
  store: createMemoryStore(),
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  log: null,
  automations: { scheduler: false },
  vacancies: {
    availability: async () => ({ available: true }),
    readResumes: async (input) => {
      reads++;
      options.push({
        browserSlot: input.browserSlot,
        headless: input.headless,
      });
      return resumeListFixture(input.browserSlot);
    },
  },
});
const stats = () => ({
  reads,
  options,
  nativeBrowserReads: false,
  providerClicks: 0,
});
const control = createServer((_req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(stats()));
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    pid: process.pid,
    base: `http://127.0.0.1:${server.port}`,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await new Promise((resolve) => control.close(resolve));
    await server.close();
    console.log(JSON.stringify(stats()));
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
