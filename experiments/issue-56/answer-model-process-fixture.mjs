// Finite child-process probe: no provider connection or credential access.
const mode = process.argv[2];
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  if (mode === 'wait') {
    process.on('SIGTERM', () => {});
    process.stdout.write('READY\n');
    globalThis.setTimeout(() => process.exit(9), 3000);
  } else if (mode === 'overflow') {
    process.stdout.write('x'.repeat(129 * 1024));
  } else if (mode === 'stderr') {
    process.stderr.write('x'.repeat(65 * 1024));
  } else if (mode === 'exit') {
    process.stderr.write('private-provider-detail');
    process.exitCode = 7;
  } else if (mode === 'invalid') {
    process.stdout.write('{broken');
  } else {
    process.stdout.write(
      JSON.stringify({
        structured_output: {
          args: process.argv.slice(3),
          prompt: input,
          unicode: '你好 · नमस्ते · Привет',
        },
      })
    );
  }
});
