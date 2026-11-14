// A real CLI process exits before the owner sends; the separate CDP watcher persists.
if (process.env.RUN_BROWSER_E2E) {
  await import('../../examples/forms-detached-review.mjs');
} else {
  console.log('SKIP detached form watcher: RUN_BROWSER_E2E not set');
}
