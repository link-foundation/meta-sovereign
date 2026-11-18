The Markdown `maxLines` cap can be exceeded by a single ordinary Telegram message or by accumulated multiline messages.

Inspected revision: [`715f937931c15810344c715e809aacf74f98912e`](https://github.com/konard/telegram-bot/tree/715f937931c15810344c715e809aacf74f98912e). This report is based on static source inspection during https://github.com/link-foundation/meta-sovereign/issues/56. I did not execute the downloaded reference implementation; the following bounded offline reproduction is provided for maintainers to run in an installed checkout.

From the repository root:

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { partitionMessages, writeParts } from './history-to-markdown.mjs';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'telegram-line-cap-'));
try {
  // 2,999 characters: below Telegram's ordinary 4,096-character text limit.
  const message = {
    id: 1,
    date: '2026-01-01 00:00:00',
    senderId: '7',
    text: Array(1500).fill('a').join('\n'),
  };
  const parts = partitionMessages([message], { '7': 'Alice' }, 1500);
  writeParts(parts, directory, 'history', null);
  const markdown = fs.readFileSync(path.join(directory, 'history-1.md'), 'utf8');
  const lines = markdown.split(/\r\n|\r|\n/).length;
  console.log({ lines, maxLines: 1500 });
  assert.ok(lines <= 1500, `Export contains ${lines} physical lines`);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
JS
```

Expected: every output file respects the configured maximum, including headers, navigation and wrappers, or the exporter explicitly documents/refuses a record it cannot fit. Inferred current result: the assertion fails because the 1,500 text lines plus author/header/navigation exceed 1,500.

Three source paths explain the behavior:

- [`partitionMessages`, lines 399–415](https://github.com/konard/telegram-bot/blob/715f937931c15810344c715e809aacf74f98912e/history-to-markdown.mjs#L399-L415) uses `currentMdLines.length`, which counts stored message strings, rather than their physical lines. Accumulated multiline messages are underestimated.
- The split condition requires an existing message, so the first oversized message is accepted without splitting. Starting a fresh part also does not recheck whether that message fits.
- [`writeParts`, lines 450–473](https://github.com/konard/telegram-bot/blob/715f937931c15810344c715e809aacf74f98912e/history-to-markdown.mjs#L450-L473) adds headers, separators and navigation after the partition estimate.

Suggested correction: track actual accumulated physical lines, reserve exact wrapper/navigation space, and explicitly continue an oversized Markdown record into additional parts. Structured data can retain the full original once with continuation references, or use a documented oversize policy. Tests should cover one multiline message, several multiline messages, the first/last wrappers and both MD/JSON files at the boundary.

Workaround: treat the current cap as advisory and post-process Markdown into smaller linked parts; increasing the configured cap only moves the boundary and does not enforce it. The integration's original streaming writer uses reserved wrapper space and continuation references, with a bounded 1,570-line regression; it does not copy this implementation.
