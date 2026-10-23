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
import { safeRegExpOrNull } from '../patterns/safe-regex.js';
import { pullLiveInto } from '../sources/index.js';

const hydrate = (persisted) => {
  const nodes = new Map();
  for (const n of persisted.nodes ?? []) {
    nodes.set(n.id, {
      ...n,
      regex: n.regex ? safeRegExpOrNull(n.regex, n.flags ?? 'i') : undefined,
    });
  }
  return { nodes, edges: persisted.edges ?? [] };
};

/**
 * `browser()` gives the browser sender, so a network whose API cannot
 * pull is read in its web app instead (R-Y38).
 */
export const registerDefaultHandlers = (store, { browser } = {}) => {
  const bus = createHandlerBus(store);
  const sourcePullBuiltIn = sourcePullHandler({
    pullLive: (target, source, options) =>
      pullLiveInto(target, source, { ...options, browser: browser?.() }),
  });
  bus.register(
    'source-pull',
    sourcePullBuiltIn.selector,
    sourcePullBuiltIn.run
  );
  const automationBuiltIn = automationHandler({ runGraph, hydrate });
  bus.register('automation', automationBuiltIn.selector, automationBuiltIn.run);
  return bus;
};
