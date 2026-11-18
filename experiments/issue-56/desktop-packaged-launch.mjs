// A finite CI launch of the actual packaged application, following issue 37's
// desktop-launch-smoke.mjs. No checkout entry point or provider account is used.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWire, LINO_TEXT } from '../../js/src/transport/lino.js';

const closeApplication = async (application) => {
  const kill = setTimeout(() => application.process().kill('SIGKILL'), 10000);
  try {
    await application.close();
  } finally {
    clearTimeout(kill);
  }
};

export const inspectPackagedWindow = async (application) => {
  const page = await application.firstWindow({ timeout: 30000 });
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\/(?:#\/.*)?$/, {
    timeout: 30000,
  });
  await page.waitForFunction(
    () => document.querySelector('#root')?.children.length > 0,
    null,
    { timeout: 30000 }
  );
  await page.waitForFunction(
    () => document.visibilityState === 'visible',
    null,
    {
      timeout: 10000,
    }
  );
  const native = await application.evaluate(({ app, BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    const preferences = windows[0]?.webContents.getLastWebPreferences();
    return {
      packaged: app.isPackaged,
      windows: windows.length,
      visible: windows[0]?.isVisible(),
      contextIsolation: preferences?.contextIsolation,
      nodeIntegration: preferences?.nodeIntegration,
    };
  });
  assert.deepEqual(
    native,
    {
      packaged: true,
      windows: 1,
      visible: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
    'packaged application must own one protected visible window'
  );
  const health = await page.evaluate(async (accept) => {
    const response = await fetch('/api/health', {
      headers: { accept },
      signal: globalThis.AbortSignal.timeout(5000),
    });
    return {
      status: response.status,
      type: response.headers.get('content-type'),
      text: await response.text(),
    };
  }, LINO_TEXT);
  assert.equal(health.status, 200, 'packaged backend must respond positively');
  assert.equal(health.type?.split(';')[0], LINO_TEXT);
  const value = decodeWire(health.text, LINO_TEXT);
  assert.equal(value.ok, true);
  assert.equal(
    value.store?.degraded,
    false,
    'packaged storage must be healthy'
  );
  return { native, page };
};

export const launchPackagedDesktop = async (binary, screenshot) => {
  // A fresh hosted runner has no owner configuration at the OS global path.
  // Local focused checks exercise the receipt validator without launching apps.
  assert.equal(
    process.env.CI,
    'true',
    'packaged launch belongs on an isolated CI runner'
  );
  // Portable receipt checks do not need the Node-only native launch dependency.
  const { _electron: electron } = createRequire(import.meta.url)('playwright');
  const directory = await mkdtemp(join(tmpdir(), 'packaged-desktop-launch-'));
  const feed = createServer((_request, response) => {
    response.writeHead(404);
    response.end();
  });
  let application;
  try {
    await new Promise((accept) => feed.listen(0, '127.0.0.1', accept));
    application = await electron.launch({
      executablePath: resolve(binary),
      cwd: directory,
      args: [
        ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
        '--port=0',
        '--tls=false',
        '--local-ui=true',
        '--verbose=false',
        `--user-data-dir=${join(directory, 'profile')}`,
      ],
      env: {
        ...process.env,
        META_SOVEREIGN_STORE_DIR: join(directory, 'store'),
        META_SOVEREIGN_UPDATE_URL: `http://127.0.0.1:${feed.address().port}`,
        MS_LIFECYCLE_DEBUG: '1',
      },
      timeout: 30000,
    });
    const child = application.process();
    let drained = false;
    let traceTail = '';
    child.stderr?.on('data', (chunk) => {
      traceTail = `${traceTail}${chunk}`.slice(-512);
      drained ||= traceTail.includes('[desktop] runtime_close_finished');
    });
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    const { native, page } = await inspectPackagedWindow(application);
    if (screenshot) {
      await page.screenshot({ path: screenshot });
    }
    await closeApplication(application);
    application = null;
    assert.equal(drained, true, 'packaged runtime must finish draining');
    assert.equal(child.exitCode, 0, 'packaged application must exit cleanly');
    assert.equal(
      child.signalCode,
      null,
      'forced exit is not a successful smoke test'
    );
    console.log(
      JSON.stringify({
        packagedDesktop: true,
        platform: process.platform,
        arch: process.arch,
        ...native,
        backendReady: true,
        cleanExit: true,
        runtimeDrained: true,
        liveProvider: false,
      })
    );
  } finally {
    try {
      if (application) {
        await closeApplication(application);
      }
    } finally {
      feed.closeAllConnections();
      await new Promise((accept) => feed.close(accept));
      await rm(directory, { recursive: true, force: true });
    }
  }
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await launchPackagedDesktop(...process.argv.slice(2));
}
