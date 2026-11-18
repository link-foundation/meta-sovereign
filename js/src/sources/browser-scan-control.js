import { randomUUID } from 'node:crypto';
import { browserChatListState } from './browser-chat-list-state.js';

/** One private ownership token shared by all operations in a bounded scan. */
export const createBrowserScanControl = (document, spec) => {
  const token = randomUUID();
  return {
    token,
    control: (operation, extra = {}) =>
      document.evaluate({
        fn: browserChatListState,
        args: [{ ...spec, operation, token, ...extra }],
      }),
  };
};
