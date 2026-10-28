import { stageServerRelease } from '../server/rolling-release.js';
import {
  createServerControl,
  requestServerControl,
} from '../server/rolling-control.js';
import { startRollingServer } from '../server/rolling-host.js';

const changesFrom = (args) => ({
  ...(args['allow-origin'] !== undefined
    ? { allowOrigins: args['allow-origin'] }
    : {}),
  ...(args['ui-url'] !== undefined ? { uiUrl: args['ui-url'] } : {}),
  ...(args['local-ui'] !== undefined ? { localUi: args['local-ui'] } : {}),
  ...(args.tls !== undefined ? { tls: String(args.tls) !== 'false' } : {}),
});

export const upgradeRunningServer = async ({ args, storeDir, log }) => {
  try {
    await requestServerControl(
      storeDir,
      { operation: 'status' },
      { timeoutMs: 2000 }
    );
  } catch (error) {
    if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) {
      return null;
    }
    throw error;
  }
  const release = await stageServerRelease({ storeDir });
  log('preparing the installed version while the current server stays active');
  const result = await requestServerControl(storeDir, {
    operation: 'upgrade',
    release,
    port: args.port,
    changes: changesFrom(args),
  });
  log(
    result.upgraded
      ? 'server upgraded; the public listener and local identity were retained'
      : 'this server version is already running'
  );
  return result;
};

export const startRollingCliServer = async ({
  storeDir,
  port,
  options,
  log,
}) => {
  const release = await stageServerRelease({ storeDir });
  const handle = await startRollingServer({
    storeDir,
    port,
    options,
    release,
    log,
  });
  let control;
  try {
    control = await createServerControl({ storeDir, handle, log });
  } catch (error) {
    await handle.close();
    throw error;
  }
  return {
    ...handle,
    close: async () => {
      await control.close();
      await handle.close();
    },
  };
};
