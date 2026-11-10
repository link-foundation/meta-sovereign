// Isolated production UI for manual/MCP checks. No external service calls.
import { startServer } from '../../js/src/server/index.js';
import { loginFixture } from '../../js/tests/helpers/telegram-login-fakes.mjs';
const fixture = await loginFixture();
const handle = await startServer({
  store: fixture.store,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  telegramMtproto: fixture.mtproto,
  telegramCreds: fixture.creds,
  automations: { scheduler: false },
});
console.log(JSON.stringify({ origin: `http://127.0.0.1:${handle.port}` }));
try {
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await handle.close();
  await fixture.close();
  process.stdin.pause();
}
