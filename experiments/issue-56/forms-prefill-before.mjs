import assert from 'node:assert/strict';
import { createFormReader } from '../../js/src/forms/reader.js';
const reader = createFormReader();
try {
  assert.equal(
    typeof reader.planReview,
    'function',
    'live reviewed prefilling exists'
  );
} finally {
  await reader.stop();
}
