/**
 * Wires the built-in DDD handlers (broadcast, profile/resume sync,
 * outreach, automation) onto a server-side store. This is where the
 * imperative `/api/broadcast`, `/api/profile`, etc. routes
 * effectively become *no-ops over the bus* — the route just writes
 * a link, the handler does the work asynchronously.
 *
 * Kept separate from `index.js` so the server module stays small and
 * easy to read.
 */

import {
  createHandlerBus,
  broadcastHandler,
  profileSyncHandler,
  resumeSyncHandler,
  outreachHandler,
  automationHandler,
} from '../handlers/index.js';
import {
  broadcast,
  syncProfile,
  syncResume,
  runOutreach,
} from '../broadcast/index.js';
import { runGraph } from '../automation/index.js';
import { listSources } from '../sources/index.js';

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
  const networks = listSources();
  const broadcastBuiltIn = broadcastHandler({ broadcast });
  bus.register('broadcast', broadcastBuiltIn.selector, broadcastBuiltIn.run);
  const profileBuiltIn = profileSyncHandler({ syncProfile, networks });
  bus.register('profile-sync', profileBuiltIn.selector, profileBuiltIn.run);
  const resumeBuiltIn = resumeSyncHandler({
    syncResume,
    networks: ['hh', 'habr-career', 'superjob', 'linkedin'],
  });
  bus.register('resume-sync', resumeBuiltIn.selector, resumeBuiltIn.run);
  const outreachBuiltIn = outreachHandler({ runOutreach });
  bus.register('outreach', outreachBuiltIn.selector, outreachBuiltIn.run);
  const automationBuiltIn = automationHandler({ runGraph, hydrate });
  bus.register('automation', automationBuiltIn.selector, automationBuiltIn.run);
  return bus;
};
