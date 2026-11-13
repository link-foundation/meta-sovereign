import { checkReceiveIsolation } from '../../js/tests/helpers/e2e-sync-receive-isolation.mjs';

export default async (page) => {
  const base = new URL(page.url()).origin;
  const context = await page.context().browser().newContext();
  const other = await context.newPage();
  const errors = [];
  const until = async (check, label, budget = 20000) => {
    const deadline = Date.now() + budget;
    while (Date.now() < deadline) {
      if (await check()) {
        return;
      }
      await page.waitForTimeout(100);
    }
    throw new Error(`MCP receive timeout: ${label}`);
  };
  try {
    for (const target of [page, other]) {
      target.on('pageerror', (error) => errors.push(error.message));
      await target.addInitScript(() => {
        globalThis.__receivePeers = [];
        const Native = globalThis.RTCPeerConnection;
        globalThis.RTCPeerConnection = class extends Native {
          constructor(...args) {
            super(...args);
            globalThis.__receivePeers.push(this);
          }
        };
      });
      await target.goto('about:blank');
      await target.goto(`${base}/#settings`);
      await target.waitForFunction(() => Boolean(globalThis.__msApi));
    }
    await until(
      () =>
        other.evaluate(() =>
          globalThis.__receivePeers.some(
            (peer) => peer.connectionState === 'connected'
          )
        ),
      'native data channel'
    );
    await checkReceiveIsolation({ page, other, until });
    if (errors.length) {
      throw new Error(errors.join('\n'));
    }
    return { ownerEditReplicated: true, remoteMergeApplied: true, errors };
  } finally {
    await context.close();
  }
};
