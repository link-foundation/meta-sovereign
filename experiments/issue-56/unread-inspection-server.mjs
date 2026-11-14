import { createServer } from 'node:http';
import { startQuestionFixtureServer } from '../../js/tests/helpers/question-fixture-server.mjs';
import { seedQuestionBrowserChat } from './question-browser-fixture.mjs';

/** Private counted UI fixture shared by read-only and notice inspections. */
export const runUnreadInspectionFixture = async (
  env,
  { pending, handle, beforeClose = () => {} }
) => {
  await seedQuestionBrowserChat(env);
  const server = await startQuestionFixtureServer(env, true);
  const stats = () => ({
    scans: env.state.scans.length,
    pending: pending(),
    sends: env.state.sends.length,
    prefills: env.state.prefills.length,
    reads: env.state.reads.length,
    senderStub: true,
    liveProvider: false,
  });
  const control = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/seed') {
      await seedQuestionBrowserChat(env);
    } else if ((await handle(url)) === false) {
      res.writeHead(400).end();
      return;
    }
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
      await beforeClose();
      await new Promise((resolve) => control.close(resolve));
      await server.close();
      await env.browser.close();
      console.log(JSON.stringify(stats()));
    })());
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
};
