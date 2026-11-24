import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

const parent = '8d367c3491dfde6322fe0441e33dc9b69419a63b';
const root = new URL('../../', import.meta.url);
const sources = new Map(
  ['cv-save-cycle.js', 'cv-watch-runtime.js', 'cv-watch-verification.js'].map(
    (file) => {
      const path = `js/src/jobs/${file}`;
      return [
        new URL(path, root).href,
        execFileSync('git', ['show', `${parent}:${path}`], {
          cwd: root,
          encoding: 'utf8',
        }),
      ];
    }
  )
);

registerHooks({
  load(url, context, nextLoad) {
    const source = sources.get(url);
    return source === undefined
      ? nextLoad(url, context)
      : { format: 'module', source, shortCircuit: true };
  },
});
