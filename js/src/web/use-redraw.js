// Draws a component again whenever an event is dispatched on the page
// (shared by the small stores that keep state outside React).

import { useEffect, useState } from 'react';

/** Draws the component again whenever `name` is dispatched. */
export const useRedrawOn = (name) => {
  const [, again] = useState(0);
  useEffect(() => {
    const on = () => again((n) => n + 1);
    globalThis.addEventListener?.(name, on);
    return () => globalThis.removeEventListener?.(name, on);
  }, [name]);
};
