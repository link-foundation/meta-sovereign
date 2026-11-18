// Node-only module observer; the HTTP fixture itself runs on every runtime.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const names = ['routes-cv.js', 'routes-vacancies.js', 'routes-telegram.js'];
const loaded = new Set();
const hook = registerHooks({
  load(url, context, nextLoad) {
    for (const name of names) {
      if (
        url === new URL(`../../js/src/server/${name}`, import.meta.url).href
      ) {
        loaded.add(name);
      }
    }
    return nextLoad(url, context);
  },
});
try {
  const { exerciseDeferredRoutes } =
    await import('./route-loading-fixture.mjs');
  const stages = [];
  await exerciseDeferredRoutes((stage) => {
    const expected =
      stage === 'started' || stage === 'guarded'
        ? []
        : stage === 'cv'
          ? ['routes-cv.js']
          : stage === 'vacancies'
            ? names.slice(0, 2)
            : names;
    // The second wire encoding reuses already imported modules.
    if (!stages.includes('telegram')) {
      assert.deepEqual([...loaded].sort(), [...expected].sort(), stage);
    }
    stages.push(stage);
  });
  console.log(JSON.stringify({ stages, loaded: [...loaded] }));
} finally {
  hook.deregister();
}
