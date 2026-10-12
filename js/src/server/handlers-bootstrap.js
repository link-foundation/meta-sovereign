/**
 * Wires the built-in DDD handlers (live source pulls, automation
 * graphs) onto a server-side store: storing a command link runs it.
 * Only reads and local planning are wired this way. Writes to other
 * services (broadcast, profile/CV sync, outreach) are deliberately not:
 * a stored or synced link must never send anything; they run from
 * their routes after an explicit confirmation (./confirmations.js).
 *
 * Kept separate from `index.js` so the server module stays small and
 * easy to read.
 */

import {
  createHandlerBus,
  sourcePullHandler,
  automationHandler,
} from '../handlers/index.js';
import { runGraph } from '../automation/index.js';
import { pullLiveInto } from '../sources/index.js';

const hydrate = (persisted) => {
  const nodes = new Map();
  for (const n of persisted.nodes ?? []) {
    nodes.set(n.id, {
      ...n,
      regex: n.regex ? new RegExp(n.regex, n.flags ?? 'i') : undefined,
    });
  }
  return { nodes, edges: persisted.edges ?? [] };
};

export const registerDefaultHandlers = (store) => {
  const bus = createHandlerBus(store);
  const sourcePullBuiltIn = sourcePullHandler({ pullLive: pullLiveInto });
  bus.register(
    'source-pull',
    sourcePullBuiltIn.selector,
    sourcePullBuiltIn.run
  );
  const automationBuiltIn = automationHandler({ runGraph, hydrate });
  bus.register('automation', automationBuiltIn.selector, automationBuiltIn.run);
  return bus;
};
