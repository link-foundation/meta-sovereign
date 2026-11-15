import { startQuestionFixtureServer } from '../../js/tests/helpers/question-fixture-server.mjs';
import { seedApiLinkStore } from './question-api-links-fixture.mjs';

export const questionApiLinksServer = async (seedStore = seedApiLinkStore) => {
  const store = await seedStore();
  const sends = [];
  const server = await startQuestionFixtureServer(
    {
      store,
      send: async (draft) => {
        sends.push(draft);
        return { status: 'sent', messageId: '2' };
      },
    },
    true
  );
  return {
    base: `http://127.0.0.1:${server.port}`,
    close: () => server.close(),
    stats: () => ({ sends: sends.length, liveProvider: false }),
  };
};

export const serveQuestionLinkFixture = (fixture) => {
  let closing;
  const close = () =>
    (closing ??= (async () => {
      const stats = await fixture.stats();
      await fixture.close();
      console.log(JSON.stringify({ ...stats, resourcesClosed: true }));
    })());
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
  console.log(
    JSON.stringify({
      base: fixture.base,
      pid: process.pid,
      liveProvider: false,
    })
  );
};

if (process.argv.includes('--serve') && !process.argv.includes('--email')) {
  serveQuestionLinkFixture(await questionApiLinksServer());
}
