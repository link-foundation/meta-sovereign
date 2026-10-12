// Things other people would see that the user switches on explicitly.
//
// Sharing "typing…" is a write to the other service (the person you
// write to sees it), so it is off until the user turns it on in
// Settings. Kept in localStorage like the appearance.

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
