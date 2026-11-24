import { reviewVkNative } from './vk-native-review.mjs';
import { verifyVkLegacyCatalogs } from '../../js/tests/helpers/e2e-vk-legacy-catalogs.mjs';
await reviewVkNative(
  verifyVkLegacyCatalogs,
  'docs/screenshots/issue-56-legacy-catalogs'
);
