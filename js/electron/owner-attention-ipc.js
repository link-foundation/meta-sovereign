import { isOwnedMainFrame } from './owned-frame.js';

export const OWNER_ATTENTION_CHANNEL = 'meta-sovereign:owner-attention';
const isIdentity = (input) =>
  ['kind', 'id', 'requestId', 'browserSlot'].every(
    (key) =>
      typeof input?.[key] === 'string' &&
      input[key].length > 0 &&
      input[key].length <= 256
  );

export const attachOwnerAttention = ({
  ipcMain,
  attention,
  contents,
  origin,
}) => {
  if (!ipcMain?.handle || !attention || !contents) {
    return () => {};
  }
  let active = true;
  ipcMain.handle(OWNER_ATTENTION_CHANNEL, async (event, operation, input) => {
    if (!active || !isOwnedMainFrame(event, contents, origin)) {
      return { ok: false };
    }
    try {
      if (operation === 'configure' && input) {
        return attention.configure(input);
      }
      if (operation === 'acknowledge' && isIdentity(input)) {
        return await attention.acknowledge(input);
      }
    } catch {
      return { ok: false };
    }
    return { ok: false };
  });
  return () => {
    if (active) {
      active = false;
      ipcMain.removeHandler(OWNER_ATTENTION_CHANNEL);
    }
  };
};
