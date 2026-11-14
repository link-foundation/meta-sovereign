import net from 'node:net';
import path from 'node:path';
import { promises as fs } from 'node:fs';

/** The SDK validates the saved profile/port/browser identity before reuse. */
const debuggingPort = async (profileDir) => {
  const saved = await fs
    .readFile(path.join(profileDir, '.browser-commander-session.json'), 'utf8')
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    });
  if (saved) {
    if (
      !Number.isInteger(saved.remoteDebuggingPort) ||
      saved.remoteDebuggingPort < 1 ||
      saved.remoteDebuggingPort > 65535
    ) {
      throw new Error('Invalid saved form browser port.');
    }
    return saved.remoteDebuggingPort;
  }
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

export const launchPersistentBrowser = async ({
  bc,
  profileDir,
  idleMs,
  ...options
}) => {
  const session = await bc.connectOrLaunch({
    ...options,
    engine: 'playwright',
    userDataDir: profileDir,
    remoteDebuggingPort: await debuggingPort(profileDir),
    idleTimeoutMs: idleMs,
  });
  try {
    const cdp = await session.page.context().newCDPSession(session.page);
    let targetId;
    try {
      ({
        targetInfo: { targetId },
      } = await cdp.send('Target.getTargetInfo'));
    } finally {
      await cdp.detach();
    }
    return {
      context: session.browser,
      page: session.page,
      persistent: { endpoint: session.cdpEndpoint, targetId, profileDir },
      detach: () => session.detach(),
      close: () => session.close(),
    };
  } catch (error) {
    await session.close();
    throw error;
  }
};
