import { startServer } from '../src/server/index.js';
import { acquireStoreLock } from '../src/storage/store-lock.js';

const port = process.parentPort;

const applicationHealth = async (handle) => {
  const passcode = await handle.passcodeState();
  if (passcode.locked) {
    return 'locked';
  }
  return handle.storeHealth().degraded ? 'degraded' : 'ready';
};

const serve = async (message) => {
  const {
    store,
    port: listenPort,
    automationDefaults,
    secretPassphrase,
  } = message;
  return startServer({
    storeDir: store,
    port: listenPort,
    host: '127.0.0.1',
    localUi: true,
    tls: false,
    automationDefaults,
    secretPassphrase,
  });
};

if (port) {
  let handle;
  let ownership;
  let sequence = Promise.resolve();
  let closing = false;
  const run = async (message) => {
    switch (message.action) {
      case 'prepare':
        if (ownership) {
          throw new Error('The desktop runner is already prepared.');
        }
        ownership = await acquireStoreLock(message.ownershipDirectory, {
          exclusive: true,
        });
        return true;
      case 'start':
        if (!ownership || handle) {
          throw new Error('The desktop runner cannot start.');
        }
        handle = await serve(message);
        return handle.port === message.port;
      case 'inspect':
        return handle ? applicationHealth(handle) : 'unknown';
      case 'close':
        closing = true;
        await handle?.close();
        ownership?.release();
        return process.exit(0);
      default:
        return null;
    }
  };
  const execute = async (message) => {
    if (closing || !message || typeof message !== 'object') {
      return;
    }
    let value = null;
    try {
      value = await run(message);
    } catch {
      if (closing) {
        process.exit(1);
      }
    }
    port.postMessage({ request: message.request, value });
  };
  port.on('message', ({ data }) => {
    sequence = sequence.then(() => execute(data));
  });
  port.postMessage({ loaded: true });
}
