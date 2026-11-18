import { createServer } from 'node:http';
import { build } from 'esbuild';
import { browserChoicePage } from '../../js/src/sources/browser-choices.js';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import { hhChoiceHtml, hhApplicationHtml } from './hh-choice-fixture.mjs';
const compiled = await build({
  entryPoints: ['js/src/sources/browser-choice-document.js'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'ChoiceDocuments',
  platform: 'node',
});
const documentCode = compiled.outputFiles[0].text;
const server = createServer((req, res) => {
  if (req.url === '/spec.json') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ spec: HH_WEB_UI, documentCode }));
    return;
  }
  res.setHeader('content-type', 'text/html');
  res.end(
    req.url === '/application'
      ? hhApplicationHtml()
      : `${hhChoiceHtml}<script>globalThis.choiceSpec=${JSON.stringify(HH_WEB_UI)};globalThis.choiceControl=(${browserChoicePage.toString()});</script>`
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
console.log(`http://127.0.0.1:${server.address().port}`);
const close = () =>
  server.close(() => {
    process.exitCode = 0;
  });
process.once('SIGINT', close);
process.once('SIGTERM', close);
