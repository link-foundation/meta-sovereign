import { loadPreviousModule } from './previous-module.mjs';

// Only delay the published assertion until the next real watcher phase.
loadPreviousModule(
  '0e676ed071a1042ffa6bc50c28a2ff32f873e496',
  'js/tests/question-period-workers.test.js',
  (source) =>
    source.replace(
      'const result = await env.until((status) =>',
      "await env.until((status) => status.phase === 'owner-draft');\n    const result = await env.until((status) =>"
    )
);
