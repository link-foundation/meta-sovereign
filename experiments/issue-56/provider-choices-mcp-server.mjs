import { createServer } from 'node:http';
import { browserChoicePage } from '../../js/src/sources/browser-choices.js';
import {
  providerChoiceHtml,
  providerChoiceUi,
} from './provider-choice-fixture.mjs';

const server = createServer((_req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(`${providerChoiceHtml}<script>
    globalThis.choiceSpec=${JSON.stringify(providerChoiceUi(base))};
    globalThis.choiceControl=(${browserChoicePage.toString()});
  </script>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`${base}/chat/7`);
const close = () =>
  server.close(() => {
    process.exitCode = 0;
  });
process.once('SIGTERM', close);
process.once('SIGINT', close);
