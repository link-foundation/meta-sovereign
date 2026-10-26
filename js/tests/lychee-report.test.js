import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBrokenUrls } from '../scripts/lychee-report.mjs';

test('archive fallback excludes successful redirects and keeps actual HTTP/network failures', () => {
  const report = `
## Errors in docs/WORK-ACCOUNTS.md
* [403] <https://help.fiverr.com/profile> (at 46:11) | Rejected status code: 403
* [500] https://dev.vk.com/en/method/messages | Server error
* [ERROR] https://missing.example.test | Could not resolve host
* [TIMEOUT] <https://slow.example.test/> | Request timed out
* [UNKNOWN] https://unknown.example.test/
* [404] <https://missing.example.test/page?view=full&lang=en>
* [403] <https://help.fiverr.com/profile> | Repeated in another file
## Redirects
* https://docs.github.com/rest --[302]--> https://docs.github.com/en/rest
* https://learn.microsoft.com/graph --[302]--> https://learn.microsoft.com/en-us/graph --[301]--> https://learn.microsoft.com/en-us/graph?view=graph-rest-1.0
## Successful
* [200] https://working.example.test/
* [302] https://redirect.example.test/
`;
  assert.deepEqual(extractBrokenUrls(report), [
    'https://help.fiverr.com/profile',
    'https://dev.vk.com/en/method/messages',
    'https://missing.example.test',
    'https://slow.example.test/',
    'https://unknown.example.test/',
    'https://missing.example.test/page?view=full&lang=en',
  ]);
  assert.deepEqual(
    extractBrokenUrls(
      '## Redirects\n* https://docs.github.com/rest --[302]--> https://docs.github.com/en/rest'
    ),
    []
  );
});
