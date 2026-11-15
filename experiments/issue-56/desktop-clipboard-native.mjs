import { execFileSync } from 'node:child_process';
import { reviewVkNative } from './vk-native-review.mjs';
import { verifyDesktopClipboard } from '../../js/tests/helpers/e2e-desktop-clipboard.mjs';

const beforeBundle = process.argv.includes('--before')
  ? execFileSync('git', ['show', '6af537ec:js/src/web/app.min.js'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
  : undefined;
await reviewVkNative(
  (browser, options) =>
    verifyDesktopClipboard(browser, { ...options, beforeBundle }),
  'docs/screenshots/issue-56-desktop-clipboard'
);
