import { execFileSync } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const parent = execFileSync(
  'git',
  [
    'show',
    '8d05198e250591110d3aee262c4053e81f251bc0:experiments/issue-56/question-browser-server.mjs',
  ],
  { encoding: 'utf8' }
);
const start = parent.indexOf('  const controls = createServer(');
const end = parent.indexOf(
  '  await new Promise((resolve) => controls.listen',
  start
);
assert.ok(start > 0 && end > start);
const path = new URL(
  './question-browser-error-parent-generated.mjs',
  import.meta.url
);
try {
  await writeFile(
    path,
    `import { createServer } from 'node:http';\nexport const makeControl = (fixture) => {\n${parent.slice(start, end)}\nreturn controls;\n};\n`
  );
  const { makeControl } = await import(pathToFileURL(path.pathname));
  const control = makeControl({
    reset: async () => {
      throw new Error('<script>unsafe()</script>');
    },
  });
  await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${control.address().port}/reset`,
      { headers: { connection: 'close' } }
    );
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('content-type'), null);
    assert.ok(body.includes('<script>'));
    console.log(
      JSON.stringify({
        parent: '8d05198e',
        status: response.status,
        contentType: null,
        reflectedExceptionMarkup: true,
      })
    );
  } finally {
    await new Promise((resolve) => control.close(resolve));
  }
} finally {
  await rm(path, { force: true });
}
