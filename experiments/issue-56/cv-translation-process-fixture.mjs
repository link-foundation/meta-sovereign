const mode = process.argv[2];
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  if (mode === 'overflow') {
    process.stdout.write('x'.repeat(140000));
  } else if (mode === 'stderr') {
    process.stderr.write('x'.repeat(40000));
  } else if (mode === 'exit') {
    process.stderr.write('private-translator-detail');
    process.exitCode = 1;
  } else if (mode === 'wait') {
    globalThis.setInterval(() => {}, 1000);
  } else {
    console.log(JSON.stringify({ input, args: process.argv.slice(3) }));
  }
});
