import { createServer } from 'node:http';
import { setImmediate } from 'node:timers';
import { diagnosticServer } from './diagnostics-fixture.mjs';

const fixture = await diagnosticServer({
  uiDefaults: { theme: 'dark', skin: 'signal', language: 'ru' },
});
let closed = false;
const close = async () => {
  if (closed) {
    return;
  }
  closed = true;
  control.close();
  await fixture.close();
  console.log(
    JSON.stringify({ applicationResourcesClosed: true, liveProvider: false })
  );
};
const control = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/close') {
    res.end('closing');
    setImmediate(() => void close());
  } else {
    res.statusCode = 404;
    res.end('unknown fixture control');
  }
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    base: fixture.base,
    control: `http://127.0.0.1:${control.address().port}`,
    liveProvider: false,
  })
);
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
