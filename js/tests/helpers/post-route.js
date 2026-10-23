// A POST to a /api/telegram route with a fake account: the status it
// answers with. Nothing reaches a network.

import { Readable } from 'node:stream';
import { handleTelegramRoutes } from '../../src/server/routes-telegram.js';

export const postRoute = async (route, body, account) => {
  const path = `/api/telegram/${route}`;
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = path;
  req.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
  };
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end() {},
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res.status;
};
