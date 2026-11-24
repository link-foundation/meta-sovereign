import { createServer } from 'node:http';
import { mountWholeTurn } from './whole-turn-fixture.mjs';
import {
  editPendingMessage,
  mountPendingHistory,
} from './pending-turn-fixture.mjs';

export const questionBrowserControlServer = (fixture) =>
  createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let result;
      if (url.pathname === '/whole-turn') {
        await mountWholeTurn(fixture);
        result = await fixture.stats();
      } else if (url.pathname === '/pending') {
        await fixture.send.readAnswerChoices({ source: 'hh', chat: '7' });
        await fixture.page.evaluate(mountPendingHistory);
        result = await fixture.stats();
      } else if (url.pathname === '/pending-edit') {
        await fixture.page.evaluate(editPendingMessage, 'When can you start?');
        result = await fixture.stats();
      } else if (url.pathname === '/summary') {
        result = await fixture.setSummary(
          url.searchParams.get('answer') ?? 'Yes'
        );
      } else if (url.pathname === '/reset') {
        result = await fixture.reset(Object.fromEntries(url.searchParams));
      } else {
        result = await fixture.stats();
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result));
    } catch {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Fixture request failed.');
    }
  });
