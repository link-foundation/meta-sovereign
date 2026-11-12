import { createServer } from 'node:http';
import { startServer } from '../../js/src/server/index.js';
import { cvPrepareFixture } from './cv-prepare-fixture.mjs';

const fixture = await cvPrepareFixture();
let providerReads = 0;
let reviewWrites = 0;
const put = fixture.store.put.bind(fixture.store);
fixture.store.put = async (row) => {
  if (row.id === 'jobs-cv-technology-review:jobs') {
    reviewWrites++;
  }
  return put(row);
};
const server = await startServer({
  localUi: true,
  port: 0,
  tls: false,
  store: fixture.store,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  log: null,
  automations: { scheduler: false },
  vacancies: {
    artifactRoot: fixture.artifactRoot,
    availability: async () => ({ available: true }),
    cvPrepare: fixture.cvPrepare,
    openSession: async () => {
      providerReads++;
      throw new Error('Local CV review must use only saved evidence');
    },
  },
});
const stats = () => ({
  providerReads,
  reviewWrites,
  ...fixture.calls,
  nativeProviderReads: false,
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
    await fixture.close();
    console.log(JSON.stringify(stats()));
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
