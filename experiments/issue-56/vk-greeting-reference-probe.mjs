import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import {
  isGreetingText,
  knownGreetingStickerIds,
} from '../../js/src/greetings/plan.js';
const reference = await readFile('ci-logs/vk-reference-greeting.js', 'utf8');
const ids = new Set();
for (const name of [
  'allStickersWithHiKeywords',
  'commonGreetingStickersIds',
  'incomingGreetingStickersIds',
]) {
  const start = reference.indexOf(`const ${name} =`);
  const text = reference
    .slice(start, reference.indexOf(';', start))
    .replace(/\/\/[^\n]*/gu, '');
  for (const match of text.matchAll(/\b[0-9]{2,}\b/gu)) {
    ids.add(match[0]);
  }
}
const known = knownGreetingStickerIds();
const missing = [...ids].filter((id) => !known.has(id));
assert.deepEqual(missing, []);
const words = [
  'трям',
  '🖖',
  '👋',
  '🖐',
  'моё приветствие',
  'мои приветствия',
  'салам',
  'салют',
  'здарова',
  'дорова',
  'ку',
  'qq',
  'шалом',
  'хай',
  'хэллоу',
  'йо',
  'йоу',
  'привет',
  'приветствую',
  'приветик',
  'приветики',
  'здрасте',
  'здравствуйте',
  'здравствуй',
  'здрасьте',
  'дд',
  'день добрый',
  'вечер добрый',
  'добрый день',
  'добрый вечер',
  'доброе утро',
  'доброй ночи',
  'доброго времени суток',
  'Привет тебе!',
  'Привет, привет!',
];
const missed = words.filter((text) => !isGreetingText(text));
assert.deepEqual(missed, []);
console.log(
  JSON.stringify({
    pinnedTrigger: '175d2d13218d9e791ae2f3e824a0d24f10319dcb',
    numericReferenceStickerIds: ids.size,
    missingIds: missing,
    russianForms: words.length,
    missedForms: missed,
  })
);

if (process.argv.includes('--record')) {
  await writeFile(
    'experiments/issue-56/vk-greeting-reference-cases.json',
    `${JSON.stringify(
      {
        referenceCommit: '175d2d13218d9e791ae2f3e824a0d24f10319dcb',
        numericStickerIds: [...ids].sort((a, b) => Number(a) - Number(b)),
        russianForms: words,
      },
      null,
      2
    )}\n`
  );
}
