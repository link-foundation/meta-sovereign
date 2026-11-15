import { reviewVkNative } from './vk-native-review.mjs';
import { verifyVkToken } from '../../js/tests/helpers/e2e-vk-token.mjs';
import { execFileSync } from 'node:child_process';

const beforeBundle = process.argv.includes('--before')
  ? execFileSync('git', ['show', 'ea0c506e:js/src/web/app.min.js'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
  : undefined;
await reviewVkNative(
  (browser, options) => verifyVkToken(browser, { ...options, beforeBundle }),
  'docs/screenshots/issue-56-vk-token'
);
