import { createServer } from 'node:http';
import { browserChoicePage } from '../../js/src/sources/browser-choices.js';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import { hhChoiceHtml, hhApplicationHtml } from './hh-choice-fixture.mjs';

const server = createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  response.end(
    JSON.stringify(
      request.url === '/spec'
        ? {
            spec: HH_WEB_UI,
            frame: `${hhChoiceHtml}<script>globalThis.choiceControl=(${browserChoicePage.toString()});</script>`,
            owner: hhApplicationHtml(),
          }
        : { fixture: 'HH delivery; synthetic account only' }
    )
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
console.log(`http://127.0.0.1:${server.address().port}`);
const close = () =>
  server.close(() => {
    console.log(JSON.stringify({ resourcesClosed: true, providerEffects: 0 }));
  });
process.once('SIGTERM', close);
process.once('SIGINT', close);
