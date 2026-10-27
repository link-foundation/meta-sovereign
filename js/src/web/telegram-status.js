import { activeAccount } from './telegram-account-scope.js';

const accounts = new WeakMap();
/** A transport failure cannot log out an account; views reuse its known status. */
export const telegramStatusFor = (api, slot = activeAccount()) => {
  let slots = accounts.get(api);
  if (!slots) {
    slots = new Map();
    accounts.set(api, slots);
  }
  if (!slots.has(slot)) {
    let status = null;
    let pending = null;
    slots.set(slot, {
      snapshot: () => status,
      read: () => {
        pending ??= Promise.resolve()
          .then(() => api.telegramStatus())
          .then(
            (next) => {
              if (next && !next.offline && !next.error) {
                status = next;
              }
              return status;
            },
            () => status
          )
          .finally(() => {
            pending = null;
          });
        return pending;
      },
    });
  }
  return slots.get(slot);
};
