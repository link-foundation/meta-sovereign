import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { publishedWebBundle } from './published-web-bundle.mjs';

const changed = execFileSync(
  'git',
  ['diff', '--name-only', '--', 'js/src/web'],
  { encoding: 'utf8' }
)
  .trim()
  .split('\n');
const bundle = await publishedWebBundle('83101692', changed);
await writeFile('ci-logs/formal-report-before-app.min.js', bundle);
console.log('Built published parent UI without mutating drafted sources.');
