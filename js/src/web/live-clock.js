// The clock a live place's "N min left" follows (R-Y197; learned, never
// copied): the time in seconds, read again every `every` ms while `enabled`.

import { useEffect, useState } from 'react';

export const useNowSeconds = (enabled, every = 30_000) => {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    setNow(Date.now() / 1000);
    const timer = globalThis.setInterval(
      () => setNow(Date.now() / 1000),
      every
    );
    return () => globalThis.clearInterval(timer);
  }, [enabled, every]);
  return now;
};
