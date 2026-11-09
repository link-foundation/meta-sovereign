// Existing API regression cases also cover the explicitly enabled legacy mode.
// New default-transport cases import the production entry point directly.
import { startServer as start } from '../../src/server/index.js';

export const startServer = (options = {}) =>
  start({ jsonCompatibility: true, ...options });
