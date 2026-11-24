import { loadPreviousModule } from './previous-module.mjs';

for (const file of [
  'js/src/cli/forms-commands.js',
  'js/src/cli/forms-review-commands.js',
  'js/src/forms/review-prefill.js',
  'js/src/forms/automatic-prefill.js',
  'js/src/server/routes-form-reviews.js',
  'js/src/server/routes-forms.js',
]) {
  loadPreviousModule('d464aa39', file);
}
