// Keep the stable rolling host independent of worker/provider command modules.
import { defaultStoreDir } from '../storage/app-directory.js';
import { serveOptions } from './server-options.js';
import { createServerLog, installCrashLogging } from '../server/log.js';
import { foundOnPort } from '../server/hosted-ui.js';
import { DEFAULT_PORTS } from '../web/discovery-constants.js';
import { maybeOpenHostedApp } from './browser-open.js';
import { setupLocalCertificate } from './trust-commands.js';
import {
  upgradeRunningServer,
  startRollingCliServer,
} from './rolling-serve.js';

// Where the server and the app are, as `serve` prints them.
const logAddresses = (handle, log) => {
  const origin = `http://127.0.0.1:${handle.port}`;
  log(`meta-sovereign listening on ${origin}`);
  log(`open the app → ${handle.uiUrl}`);
  if (handle.tls) {
    log(
      `https too → https://127.0.0.1:${handle.port} (Safari: trust it once → meta-sovereign trust)`
    );
  }
  if (!foundOnPort(handle.port)) {
    log(
      `the app looks for the server on ports ${DEFAULT_PORTS.join(', ')}; on ${handle.port} set it in Settings → Server`
    );
  }
  log(
    handle.localUi
      ? `local copy (fallback, e.g. for Safari or offline) → ${origin}/`
      : `local copy off: ${origin}/ opens the app above (enable with --local-ui=true)`
  );
};

export const serveCmd = async (args, log) => {
  const storeDir = args.store ?? defaultStoreDir();
  const repeated = await repeatServe(args, storeDir, log);
  if (repeated !== null) {
    return repeated;
  }
  // Verbose logging is on by default: every request, event and error is
  // written to a file in the app folder (and echoed here), so the root
  // cause of any issue is always on disk. `--quiet-logs` opts out.
  const serverLog =
    args['quiet-logs'] === true
      ? null
      : await createServerLog({
          storeDir,
          toStdout: args.foreground !== false,
        });
  if (serverLog) {
    installCrashLogging(serverLog.log);
  }
  let handle;
  try {
    if (args.foreground !== false) {
      await setupLocalCertificate(args, log);
    }
    const options = {
      port: Number(args.port ?? 8787),
      storeDir,
      ...(serverLog ? { log: serverLog.log } : {}),
      ...serveOptions(args),
    };
    handle = await createServeHandle(args, options);
  } catch (error) {
    // A busy port (or any start failure) ends here with a message, a
    // non-zero exit and nothing left running (R-Z1).
    log(`cannot start the server: ${error.message}`);
    await serverLog?.close();
    return 1;
  }
  logAddresses(handle, log);
  maybeOpenHostedApp(args, handle, log);
  if (serverLog) {
    log(`verbose logs → ${serverLog.file}`);
  }
  // Block on SIGINT/SIGTERM so the CLI keeps the server alive until
  // the user explicitly stops it. Tests pass `args.foreground = false`
  // to skip the wait and reclaim control after startup.
  if (args.foreground === false) {
    await serverLog?.close();
    return 0;
  }
  await new Promise((resolve) => {
    const stop = async () => {
      await handle.close();
      await serverLog?.close();
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return 0;
};

const createServeHandle = async (args, options) => {
  if (args.foreground === false) {
    const { startServer } = await import('../server/index.js');
    return startServer(options);
  }
  return startRollingCliServer({
    storeDir: options.storeDir,
    port: options.port,
    options: serveOptions(args),
    log: options.log ?? (() => {}),
  });
};

const repeatServe = async (args, storeDir, log) => {
  if (args.foreground === false) {
    return null;
  }
  try {
    const running = await upgradeRunningServer({ args, storeDir, log });
    if (!running) {
      return null;
    }
    logAddresses(running, log);
    maybeOpenHostedApp(args, running, log);
    return 0;
  } catch (error) {
    log(`cannot upgrade the server: ${error.message}`);
    return 1;
  }
};
