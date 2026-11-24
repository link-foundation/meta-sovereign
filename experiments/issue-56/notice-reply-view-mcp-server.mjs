import { createServer } from 'node:http';
import {
  browserChoicePage,
  browserChoiceSpec,
} from '../../js/src/sources/browser-choices.js';
import { browserInactiveView } from '../../js/src/sources/browser-inactive-view.js';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import { noticePolicyHtml } from './notice-policy-browser-fixture.mjs';
import { noticeReply } from './notice-fixture.mjs';

const fixture = JSON.stringify({
  html: noticePolicyHtml(),
  choice: browserChoicePage.toString(),
  inactive: browserInactiveView.toString(),
  spec: browserChoiceSpec(HH_WEB_UI),
  text: noticeReply,
});
const server = createServer((_req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(fixture);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
console.log(JSON.stringify({ port: server.address().port, pid: process.pid }));
process.once('SIGTERM', () => server.close());
