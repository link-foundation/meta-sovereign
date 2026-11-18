/** Prefer the desktop write-only capability; accept only its explicit receipt. */
export const writeClipboardText = async (
  text,
  {
    shell = globalThis.metaSovereignShell,
    clipboard = globalThis.navigator?.clipboard,
  } = {}
) => {
  if (shell?.platform === 'electron' && typeof shell.copyText === 'function') {
    const receipt = await shell.copyText(text);
    if (receipt?.ok !== true) {
      throw new Error('clipboard unavailable');
    }
    return;
  }
  if (typeof clipboard?.writeText !== 'function') {
    throw new Error('clipboard unavailable');
  }
  await clipboard.writeText(text);
};
