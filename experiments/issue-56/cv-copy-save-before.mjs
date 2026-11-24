import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

const parent = 'f1467967b26789dd735b21705a975d998ea2c775';
const root = new URL('../../', import.meta.url);
const sources = new Map(
  [
    'js/src/jobs/cv-save-cycle.js',
    'js/src/jobs/cv-watch-runtime.js',
    'js/src/jobs/cv-watch-verification.js',
    'experiments/issue-56/cv-created-workplace-fixture.mjs',
  ].map((path) => [
    new URL(path, root).href,
    execFileSync('git', ['show', `${parent}:${path}`], {
      cwd: root,
      encoding: 'utf8',
    }),
  ])
);

registerHooks({
  load(url, context, nextLoad) {
    const source = sources.get(url);
    return source === undefined
      ? nextLoad(url, context)
      : { format: 'module', source, shortCircuit: true };
  },
});
