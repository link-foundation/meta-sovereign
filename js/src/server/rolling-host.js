import { listenLocal } from './local-tls.js';
import { createWorkerProxy } from './worker-proxy.js';
import { createWorkerTarget } from './worker-target.js';
import { RollingSupervisor } from './rolling-supervisor.js';
import { hostedUiUrl, localUiEnabled } from './hosted-ui.js';

export const startRollingServer = async ({
  port = 8787,
  storeDir,
  options = {},
  release,
  log = () => {},
  standbyMs,
}) => {
  const target = createWorkerTarget();
  let boundPort = port;
  const proxy = createWorkerProxy({
    target: target.wait,
    port: () => boundPort,
    options,
    log,
  });
  const sockets = new Set();
  const track = (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  };
  proxy.server.on('connection', track);
  const listening = await listenLocal(proxy.server, {
    port,
    storeDir,
    tls: options.tls,
    log,
  });
  if (listening.listener !== proxy.server) {
    listening.listener.on('connection', track);
  }
  boundPort = listening.listener.address().port;
  const supervisor = new RollingSupervisor({
    storeDir,
    options,
    port: boundPort,
    tls: listening.tls,
    target,
    configure: proxy.configure,
    log,
    standbyMs,
  });
  try {
    await supervisor.start(release);
  } catch (error) {
    target.close();
    sockets.forEach((socket) => socket.destroy());
    listening.listener.close();
    proxy.server.close();
    proxy.close();
    throw error;
  }
  return {
    port: boundPort,
    tls: listening.tls,
    uiUrl: hostedUiUrl(options.uiUrl),
    localUi: localUiEnabled(options.localUi),
    status: () => supervisor.status(),
    upgrade: (next, changes) => supervisor.upgrade(next, changes),
    close: async () => {
      listening.listener.close();
      proxy.server.close();
      sockets.forEach((socket) => socket.destroy());
      proxy.close();
      await supervisor.close();
    },
  };
};
