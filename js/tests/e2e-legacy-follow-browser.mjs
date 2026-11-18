// Production routes and owned clients are drained by the shared native check.
import { verifyLegacyFollow } from './helpers/e2e-legacy-follow.mjs';

await verifyLegacyFollow();
