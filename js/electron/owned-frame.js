/** Only the current main frame on the desktop server may invoke shell IPC. */
export const isOwnedMainFrame = (event, contents, origin) => {
  try {
    return (
      !contents.isDestroyed() &&
      event.sender === contents &&
      event.senderFrame === contents.mainFrame &&
      new URL(event.senderFrame.url).origin === origin
    );
  } catch {
    return false;
  }
};
