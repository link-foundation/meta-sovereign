import { loadPreviousModule } from './previous-module.mjs';

for (const file of [
  'application-service.js',
  'application-review.js',
  'application-options.js',
  'application-actions.js',
  'application-full-form.js',
  'application-batch.js',
  'application-continuation.js',
  'application-drafts.js',
]) {
  loadPreviousModule('4fefd254', `js/src/jobs/${file}`);
}
