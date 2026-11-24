import { createServer } from 'node:http';
import { browserChoicePage } from '../../js/src/sources/browser-choices.js';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import { archiveBrowserHistoryWindow } from '../../js/src/sources/browser-history-archive.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import {
  withMessageVersions,
  messageVersions,
} from '../../js/src/storage/message-versions.js';
import { hhChoiceHtml, hhApplicationHtml } from './hh-choice-fixture.mjs';

const store = withMessageVersions(createMemoryStore());
let refused = false;
let writes = 0;
const serve = async (request, response) => {
  response.setHeader('content-type', 'application/json');
  let result = { fixture: 'HH live capture; synthetic account only' };
  if (request.url === '/spec') {
    result = {
      spec: HH_WEB_UI,
      frame: `${hhChoiceHtml}<script>globalThis.choiceControl=(${browserChoicePage.toString()});</script>`,
      owner: hhApplicationHtml(),
    };
  } else if (request.url === '/fail' && request.method === 'POST') {
    refused = true;
  } else if (request.url === '/snapshot' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 2097152) {
        throw new Error('Fixture input bound exceeded');
      }
    }
    if (refused) {
      response.statusCode = 503;
      result = { code: 'question-history-save-failed' };
    } else {
      result = await archiveBrowserHistoryWindow(store, {
        ...JSON.parse(body),
        source: 'hh',
      });
      writes++;
    }
  } else if (request.url === '/state') {
    const saved = await store.get('msg:hh:7:102');
    const versions = saved
      ? await messageVersions(store, saved.id)
      : { versions: [] };
    result = {
      body: saved?.body,
      delivery: saved?.delivery,
      writes,
      versions: versions.versions.map((v) => v.snapshot.body),
    };
  }
  response.end(JSON.stringify(result));
};
const server = createServer((request, response) => {
  serve(request, response).catch(() => {
    response.statusCode = 500;
    response.end(JSON.stringify({ code: 'fixture-failed' }));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
console.log(`http://127.0.0.1:${server.address().port}`);
const close = () =>
  server.close(() => {
    console.log(JSON.stringify({ resourcesClosed: true, providerEffects: 0 }));
  });
process.once('SIGTERM', close);
process.once('SIGINT', close);
