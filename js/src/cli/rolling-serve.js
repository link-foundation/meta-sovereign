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
  ...(args['json-compatibility'] !== undefined
    ? { jsonCompatibility: String(args['json-compatibility']) === 'true' }
    : {}),
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
  const began = globalThis.performance.now();
  const phase = (name) => {
    if (process.env.MS_LIFECYCLE_DEBUG === '1') {
      console.error(
        `[rolling-start] ${name} after ${Math.round(globalThis.performance.now() - began)} ms`
      );
    }
  };
  phase('staging');
  const release = await stageServerRelease({ storeDir });
  phase('release_ready');
  const handle = await startRollingServer({
    storeDir,
    port,
    options,
    release,
    log,
  });
  phase('worker_ready');
  let control;
  try {
    control = await createServerControl({ storeDir, handle, log });
    phase('control_ready');
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
