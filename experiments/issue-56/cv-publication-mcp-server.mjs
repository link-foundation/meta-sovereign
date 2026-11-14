import { startServer } from '../../js/src/server/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
import { cvPublicationFixture } from './cv-publication-fixture.mjs';

const fixture = await cvPublicationFixture();
let server;
try {
  server = await startServer({
    localUi: true,
    port: 0,
    tls: false,
    store: fixture.store,
    storeDir: fixture.folder,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    log: null,
    automations: { scheduler: false },
    vacancies: fixture.options,
  });
} catch (error) {
  await fixture.close();
  throw error;
}
console.log(
  JSON.stringify({
    pid: process.pid,
    base: `http://127.0.0.1:${server.port}`,
    repository: fixture.repository,
    tutorial: {
      key: TUTORIAL_STORAGE_KEY,
      preference: { v: TUTORIAL_VERSION, off: true, completed: true },
    },
    realProvider: false,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await server.close();
    const remote = (
      await fixture.command(['rev-parse', 'refs/heads/main'], fixture.remote)
    ).stdout.trim();
    console.log(
      JSON.stringify({
        remoteCommit: remote,
        gitCalls: fixture.calls.length,
        pushes: fixture.calls.filter((args) => args.includes('push')).length,
        resourcesClosed: true,
        realProvider: false,
      })
    );
    await fixture.close();
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
