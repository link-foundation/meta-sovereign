// One verified scan, a failed fresh verification, then explicit recovery.
import { startServer } from '../../js/src/server/index.js';
import { followSessionFixture } from '../../js/tests/helpers/telegram-follow-session.mjs';

const f = await followSessionFixture();
const scan = f.creds.scan;
f.creds.scan = async (...args) => {
  f.state.refuse = false;
  const result = await scan(...args);
  f.state.refuse = true;
  return result;
};
const handle = await startServer({
  store: f.store,
  storeDir: f.root,
  port: 0,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramCreds: f.creds,
  telegramMtproto: f.mtproto,
  telegramAccount: f.account,
  automations: { scheduler: false },
});
console.log(JSON.stringify({ origin: `http://127.0.0.1:${handle.port}` }));
console.log('r + Enter permits fresh verification; Enter closes the fixture.');
try {
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
    process.stdin.on('data', (value) => {
      if (value.toString().trim() === 'r') {
        f.state.refuse = false;
      } else {
        resolve();
      }
    });
  });
} finally {
  console.log(
    JSON.stringify({
      sourceUnchanged: await f.unchanged(),
      actualImported:
        (await f.store.get('secret:telegram:user-session'))?.value ===
        f.session,
      clientsClosed: f.state.clients.every((c) => c.closed),
    })
  );
  await handle.close();
  await f.close();
  process.stdin.pause();
}
