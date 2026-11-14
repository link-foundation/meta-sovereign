import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { launchPersistentBrowser } from '../cv/persistent-browser.js';
import { encodeWire } from '../transport/lino.js';
import { writeFileDurable } from '../storage/durable.js';
import { createWatcherControl } from './watcher-rpc.js';
import { readWatcherFile, watcherFile } from './watcher-files.js';
import { createWatcherCore } from './watcher-core.js';

export const runFormWatcher = async (bootstrap) => {
  const config = await readWatcherFile(bootstrap);
  if (
    config.version !== 1 ||
    !/^[a-f0-9]{64}$/u.test(config.token) ||
    !Number.isInteger(config.idleMs) ||
    config.idleMs < 1 ||
    config.idleMs > 86400000 ||
    !/^[A-Z0-9]+$/iu.test(config.targetId) ||
    !config.profileDir ||
    !config.storeDirectory ||
    !config.watchDirectory
  ) {
    throw new Error('Invalid form watcher launch configuration.');
  }
  const file = watcherFile(config.watchDirectory);
  let browser;
  let commander;
  let core;
  let control;
  let finishing;
  const metadata = (state) => ({
    version: 1,
    token: config.token,
    pid: process.pid,
    slot: config.slot,
    id: config.id,
    targetId: config.targetId,
    profileDir: config.profileDir,
    state,
    port: control?.port ?? null,
  });
  const finish = (reason) => {
    finishing ??= (async () => {
      const results = await Promise.allSettled([
        core?.stop(),
        control?.close(),
      ]);
      try {
        await commander?.destroy();
      } catch (error) {
        results.push({ status: 'rejected', reason: error });
      }
      try {
        await browser?.close();
      } catch (error) {
        results.push({ status: 'rejected', reason: error });
      }
      const failed = results.some((item) => item.status === 'rejected');
      await writeFileDurable(
        file,
        encodeWire({ ...metadata(failed ? 'stop-failed' : 'stopped'), reason })
      );
      return failed ? 1 : 0;
    })();
    return finishing;
  };
  const finished = (reason) => {
    void finish(reason).then(
      (code) => process.exit(code),
      () => process.exit(1)
    );
  };
  try {
    const bc = await import('browser-commander');
    browser = await launchPersistentBrowser({
      bc,
      profileDir: config.profileDir,
      targetId: config.targetId,
      idleMs: config.idleMs,
    });
    if (browser.persistent.targetId !== config.targetId) {
      throw new Error('The form watcher browser target changed.');
    }
    commander = bc.makeBrowserCommander({
      page: browser.page,
      enableNetworkTracking: false,
      enableNavigationManager: false,
      enableDialogManager: false,
    });
    core = await createWatcherCore({
      session: { ...browser, commander },
      config,
      finished,
    });
    control = await createWatcherControl({
      token: config.token,
      dispatch: (operation, value) => {
        if (operation === 'stop') {
          globalThis.setTimeout(() => finished('owner-stop'), 20);
          return { ok: true, state: 'stopping' };
        }
        return core.dispatch(operation, value);
      },
    });
    browser.page.once('close', () => finished('browser-closed'));
    process.once('SIGINT', () => finished('signal'));
    process.once('SIGTERM', () => finished('signal'));
    await writeFileDurable(file, encodeWire(metadata('active')));
    await fs.rm(bootstrap, { force: true });
  } catch (error) {
    await finish('startup-failed');
    await writeFileDurable(
      file,
      encodeWire({
        ...metadata('failed'),
        error: error.code ?? 'form-watcher-start',
        message: error.message.slice(0, 1000),
      })
    );
    throw error;
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runFormWatcher(process.argv[2]).catch(() => {
    process.exitCode = 1;
  });
}
