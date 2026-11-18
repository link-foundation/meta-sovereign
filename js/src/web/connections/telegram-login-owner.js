import { useEffect, useRef } from 'react';
import { api } from '../dom.js';

// A mode/scan owns its pending responses and every interactive controller it
// discovers. Even a start response arriving after navigation must be cancelled.
export const createTelegramLoginOwner = (cancel) => {
  let generation = 0;
  let mounted = true;
  const ids = new Set();
  const stop = (id) => {
    Promise.resolve()
      .then(() => cancel(id))
      .catch(() => {});
  };
  const current = (ticket) => mounted && ticket === generation;
  const reset = () => {
    generation++;
    for (const id of ids) {
      stop(id);
    }
    ids.clear();
  };
  return {
    ticket: () => generation,
    current,
    take(ticket, id) {
      if (!current(ticket)) {
        if (id) {
          stop(id);
        }
        return false;
      }
      if (id) {
        ids.add(id);
      }
      return true;
    },
    release: (id) => ids.delete(id),
    reset,
    mount() {
      mounted = true;
    },
    close() {
      mounted = false;
      reset();
    },
  };
};

export const useTelegramLoginOwner = () => {
  const ref = useRef(null);
  ref.current ??= createTelegramLoginOwner((id) =>
    api.telegramLogin('cancel', { id })
  );
  const owner = ref.current;
  useEffect(() => {
    owner.mount();
    return () => owner.close();
  }, [owner]);
  return owner;
};
