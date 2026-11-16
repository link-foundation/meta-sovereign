import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

/** Load one exact Git module for a finite regression; retain current dependencies. */
export const loadPreviousModule = (
  revision,
  file,
  transform = (source) => source
) => {
  const target = new URL(`../../${file}`, import.meta.url).href;
  const source = execFileSync('git', ['show', `${revision}:${file}`], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024,
  });
  registerHooks({
    load(url, context, nextLoad) {
      return url === target
        ? { format: 'module', source: transform(source), shortCircuit: true }
        : nextLoad(url, context);
    },
  });
};
