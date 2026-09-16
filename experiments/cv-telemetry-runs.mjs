/**
 * Issue #29: does one CV run stay one run in the telemetry store?
 *
 * Reproduces the bug where `run.finish` repeated `runId` in its
 * payload, redaction rewrote it (a run id looks like a token) and the
 * run split in two. Run with `node experiments/cv-telemetry-runs.mjs`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createFakeCommander } from '../js/tests/helpers/fake-commander.js';
import {
  loadCvTelemetry,
  readCvFrom,
  summarizeCvRuns,
} from '../js/src/cv/index.js';
import { createMemoryStore } from '../js/src/storage/index.js';

const stateJson = readFileSync(
  fileURLToPath(
    new URL(
      '../js/tests/fixtures/habr-career-profile-state.json',
      import.meta.url
    )
  ),
  'utf8'
);
const SSR = 'script[type="application/json"][data-ssr-state="true"]';

const commander = createFakeCommander({
  pages: {
    'https://career.habr.com/anna': {
      nodes: {
        [SSR]: [{ text: stateJson }],
        body: [{ text: '', html: '<body></body>' }],
      },
    },
  },
});

const store = createMemoryStore();
await readCvFrom('habr-career', { commander, store, vars: { login: 'anna' } });
const events = await loadCvTelemetry(store);
const runs = summarizeCvRuns(events);
console.log(`events: ${events.length}, runs: ${runs.length}`);
console.log(JSON.stringify(runs, null, 2));
