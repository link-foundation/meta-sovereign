/**
 * Electron desktop shell entry point (R-F3).
 *
 * Opens a single `BrowserWindow` pointing at the local web server
 * started in-process, so the same React app served over HTTP also
 * runs in Electron without a duplicate render path. The actual
 * `electron` runtime dependency is added in a follow-up PR alongside
 * a `npm run electron` script; this file is the seed.
 */

const start = async () => {
  const { app, BrowserWindow } = await import('electron').catch(() => ({}));
  if (!app || !BrowserWindow) {
    console.error(
      'electron is not installed; run `npm i -D electron` to enable the desktop shell.'
    );
    process.exit(1);
  }
  const { startServer } = await import('../src/server/index.js');
  const handle = await startServer({ port: 0 });
  await app.whenReady();
  const win = new BrowserWindow({ width: 1280, height: 800 });
  await win.loadURL(`http://127.0.0.1:${handle.port}/`);
  app.on('window-all-closed', () => {
    handle.close().then(() => app.quit());
  });
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
