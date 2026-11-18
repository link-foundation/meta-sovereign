/** Own one desktop window and drain the local runtime before OS Quit. */
export const attachDesktopLifecycle = async ({
  app,
  BrowserWindow,
  createWindow,
  handle,
  platform = process.platform,
  report = (error) => console.error('[electron] lifecycle failed', error),
}) => {
  let opening = null;
  let closing = null;
  let closed = false;
  let quitRequested = false;
  const trace = (stage) => {
    if (process.env.MS_LIFECYCLE_DEBUG === '1') {
      console.error(`[desktop] ${stage}`);
    }
  };
  const close = () => {
    closing ??= Promise.resolve()
      .then(() => {
        trace('runtime_close_started');
        return handle.close();
      })
      .then(() => {
        closed = true;
        trace('runtime_close_finished');
      });
    return closing;
  };
  const show = () => {
    if (closing) {
      return Promise.resolve(null);
    }
    if (opening) {
      return opening;
    }
    const existing = BrowserWindow.getAllWindows()[0];
    if (existing) {
      existing.show();
      existing.focus?.();
      return Promise.resolve(existing);
    }
    opening = Promise.resolve()
      .then(() => {
        trace('window_open_requested');
        return closing ? null : createWindow();
      })
      .finally(() => {
        opening = null;
      });
    return opening;
  };
  const activate = () => {
    void show().catch(report);
  };
  const beforeQuit = (event) => {
    if (closed) {
      return;
    }
    event.preventDefault();
    if (quitRequested) {
      return;
    }
    quitRequested = true;
    void close().then(() => app.quit(), report);
  };
  const windowsClosed = () => {
    if (platform !== 'darwin') {
      app.quit();
    }
  };
  const dispose = () => {
    app.removeListener('activate', activate);
    app.removeListener('before-quit', beforeQuit);
    app.removeListener('window-all-closed', windowsClosed);
  };
  app.on('activate', activate);
  app.on('before-quit', beforeQuit);
  app.on('window-all-closed', windowsClosed);
  try {
    await show();
  } catch (error) {
    dispose();
    throw error;
  }
  return { show, close, dispose };
};
