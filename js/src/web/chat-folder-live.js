// Folders that change on another device (R-Y172; learned, never copied):
// Telegram says updateDialogFilter, updateDialogFilters or
// updateDialogFilterOrder, the server keeps one `folders-live:telegram`
// link whose `rev` grows with each (./../sources/telegram-account-live.js)
// and the page, which listens to the server's event stream, asks for the
// folders again. One stream is shared by everything on the page that shows
// folders (the tabs, Settings → Folders), opened with the first and closed
// with the last.

/** The id of the link that says the folders changed. */
export const FOLDERS_LIVE_ID = 'folders-live:telegram';

const shared = new WeakMap(); // api -> { listeners, stop, opened }

const notify = (entry) => {
  for (const listener of [...entry.listeners]) {
    listener();
  }
};

// Opens the stream for `api` once; the listeners are told of each change
// and, after the stream was lost and came back, of what it missed.
const open = (api, entry) => {
  let stopped = false;
  Promise.resolve(
    api.events(
      (event) => {
        if (event?.type === 'put' && event.link?.id === FOLDERS_LIVE_ID) {
          notify(entry);
        }
      },
      (state) => {
        if (state === 'open' && entry.opened) {
          notify(entry);
        }
        entry.opened ||= state === 'open';
      }
    )
  ).then(
    (close) => {
      if (stopped) {
        close?.();
      } else {
        entry.stop = close ?? (() => {});
      }
    },
    () => {}
  );
  entry.stop = () => {
    stopped = true;
  };
};

/**
 * `onChange()` is called whenever the folders changed elsewhere; returns
 * the function that stops it. Nothing happens without a live stream.
 */
export const watchFolders = (api, onChange) => {
  if (typeof api?.events !== 'function') {
    return () => {};
  }
  let entry = shared.get(api);
  if (!entry) {
    entry = { listeners: new Set(), stop: null, opened: false };
    shared.set(api, entry);
  }
  entry.listeners.add(onChange);
  if (entry.listeners.size === 1) {
    open(api, entry);
  }
  return () => {
    entry.listeners.delete(onChange);
    if (entry.listeners.size === 0) {
      entry.stop?.();
      shared.delete(api);
    }
  };
};
