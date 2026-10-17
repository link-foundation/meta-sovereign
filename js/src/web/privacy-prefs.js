// Things other people would see, as the user chose in Settings.
//
// Sharing "typing…" is a write to the other service (the person you
// write to sees it), so it is off until the user turns it on.
//
// Marking chats read is on unless the user turns it off: reading a chat
// here is reading it, as in every Telegram app, and with it off the
// unread counts here and on the phone never go down. Kept in
// localStorage like the appearance.

import { useState } from 'react';

export const SHARE_TYPING_KEY = 'metaSovereignShareTyping';

export const readShareTyping = (storage = globalThis.localStorage) => {
  try {
    return storage?.getItem(SHARE_TYPING_KEY) === 'on';
  } catch {
    return false;
  }
};

export const writeShareTyping = (on, storage = globalThis.localStorage) => {
  try {
    if (on) {
      storage?.setItem(SHARE_TYPING_KEY, 'on');
    } else {
      storage?.removeItem(SHARE_TYPING_KEY);
    }
  } catch {
    // Private mode: the choice lasts for this page only.
  }
};

export const useShareTyping = () => {
  const [on, setOn] = useState(readShareTyping);
  return [
    on,
    (next) => {
      writeShareTyping(next);
      setOn(next);
    },
  ];
};

export const READ_RECEIPTS_KEY = 'metaSovereignReadReceipts';

export const readReadReceipts = (storage = globalThis.localStorage) => {
  try {
    return storage?.getItem(READ_RECEIPTS_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const writeReadReceipts = (on, storage = globalThis.localStorage) => {
  try {
    if (on) {
      storage?.removeItem(READ_RECEIPTS_KEY);
    } else {
      storage?.setItem(READ_RECEIPTS_KEY, 'off');
    }
  } catch {
    // Private mode: the choice lasts for this page only.
  }
};

export const useReadReceipts = () => {
  const [on, setOn] = useState(readReadReceipts);
  return [
    on,
    (next) => {
      writeReadReceipts(next);
      setOn(next);
    },
  ];
};
