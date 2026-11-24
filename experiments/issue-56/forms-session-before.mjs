import assert from 'node:assert/strict';
import { createFormReader } from '../../js/src/forms/reader.js';
const reader = createFormReader();
try {
  assert.equal(
    typeof reader.openReview,
    'function',
    'persistent review controls exist'
  );
} finally {
  await reader.stop();
}
