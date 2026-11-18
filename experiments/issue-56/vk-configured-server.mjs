import { createServer } from 'node:http';
import { desktopServer } from './vk-desktop-fixture.mjs';
import { loadVkFriends } from '../../js/src/automation/vk-friends.js';

const fixture = await desktopServer();
const stats = async () => ({
  settings: (await loadVkFriends(fixture.store)).settings,
  syntheticFriendCalls: fixture.effects.length,
  messages: fixture.messages(),
  liveProvider: false,
});
// This loopback test control affects only a synthetic fixture's acknowledgements.
const control = createServer(async (request, response) => {
  if (
    request.method === 'POST' &&
    ['/refuse', '/allow'].includes(request.url)
  ) {
    fixture.refuseWrites(request.url === '/refuse');
  }
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(await stats()));
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    pid: process.pid,
    base: fixture.base,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    const result = await stats();
    await new Promise((resolve) => control.close(resolve));
    await fixture.close();
    console.log(JSON.stringify({ ...result, resourcesClosed: true }));
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
