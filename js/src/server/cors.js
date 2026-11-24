// Preserve the synchronous route API; the host supplies its lazy error writer.
import { fail } from './util.js';
import { applyCors } from './cors-policy.js';

export {
  DEFAULT_ALLOWED_ORIGINS,
  parseAllowedOrigins,
  hostAllowed,
  classifyOrigin,
  corsContext,
} from './cors-policy.js';

export const handleCors = (req, res, allowed) =>
  applyCors(req, res, allowed, fail);
