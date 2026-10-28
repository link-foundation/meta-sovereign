// One queue owner for the unlocked app, independent of the selected section.
import React, { useMemo } from 'react';
import { OutboxContext } from './outbox-context.js';
import { useOutboxQueue } from './chat-live.js';
import { chatFeedFor } from './chat-feed.js';

export const OutboxHost = ({ api, children }) => {
  const feed = useMemo(() => chatFeedFor(api), [api]);
  const queue = useOutboxQueue({
    api,
    addLinks: (links = []) =>
      feed.push(links.filter(Boolean).map((link) => ({ type: 'put', link }))),
    after: () => {},
  });
  return React.createElement(
    OutboxContext.Provider,
    { value: queue },
    children
  );
};
