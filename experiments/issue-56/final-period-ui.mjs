// Isolated finite answer controls. No provider adapters, credentials or sends.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';

const directory = await mkdtemp(join(tmpdir(), 'ms-final-period-'));
const store = createMemoryStore();
const fixture = {
  id: 'qa-rule:period',
  question: 'Where do you live?',
  answers: [
    { text: 'Vietnam', count: 4, approved: true, evidence: ['fixture:plain'] },
    {
      text: 'Vietnam.',
      count: 1,
      approved: true,
      evidence: ['fixture:period'],
    },
  ],
};
if (process.argv.includes('--wording')) {
  const { wordingRule, aliases } =
    await import('./answer-equivalents-fixture.mjs');
  Object.assign(fixture, wordingRule());
  fixture.answers.push(
    { text: aliases[0], count: 2, evidence: ['wording:a'] },
    { text: aliases[1], count: 3, evidence: ['wording:b'] }
  );
}
if (process.argv.includes('--availability')) {
  const { availabilityRule } =
    await import('./answer-availability-fixture.mjs');
  Object.assign(fixture, availabilityRule());
}
if (process.argv.includes('--irrelevant-timing')) {
  const { unrelated } = await import('./answer-availability-fixture.mjs');
  fixture.answers.push({
    text: unrelated,
    approved: true,
    count: 9,
    evidence: ['fixture:unrelated-timing'],
  });
}
if (process.argv.includes('--split-period')) {
  const [plain, dotted] = fixture.answers;
  await store.put({
    ...fixture,
    id: `${fixture.id}-dotted`,
    answers: [dotted],
  });
  fixture.answers = [plain];
}
await store.put(fixture);
const server = await startServer({
  store,
  storeDir: directory,
  port: 0,
  localUi: true,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  automations: { scheduler: false },
});
try {
  console.log(JSON.stringify({ origin: `http://127.0.0.1:${server.port}` }));
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
    process.stdin.once('data', resolve);
  });
} finally {
  await server.close();
  await rm(directory, { recursive: true, force: true });
  process.stdin.pause();
}
