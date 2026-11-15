export const CLIPBOARD_WRITE_CHANNEL = 'meta-sovereign:clipboard-write';
export const MAX_CLIPBOARD_TEXT = 1024 * 1024;

/** Write-only capability for this owned main frame, released with its window. */
export const attachClipboard = ({ ipcMain, clipboard, contents, origin }) => {
  if (!ipcMain?.handle || !clipboard?.writeText || !contents) {
    return () => {};
  }
  let active = true;
  ipcMain.handle(CLIPBOARD_WRITE_CHANNEL, (event, value) => {
    try {
      if (
        !active ||
        contents.isDestroyed() ||
        event.sender !== contents ||
        event.senderFrame !== contents.mainFrame ||
        new URL(event.senderFrame.url).origin !== origin ||
        typeof value !== 'string' ||
        value.length > MAX_CLIPBOARD_TEXT
      ) {
        return { ok: false };
      }
      clipboard.writeText(value);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
  return () => {
    if (active) {
      active = false;
      ipcMain.removeHandler(CLIPBOARD_WRITE_CHANNEL);
    }
  };
};
