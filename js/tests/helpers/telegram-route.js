// What the Telegram tests of a source and its route share: a fake GramJS
// class by name, and a POST through handleTelegramRoutes → its status.

import { Readable } from 'node:stream';
import { handleTelegramRoutes } from '../../src/server/routes-telegram.js';

export const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

export const postRoute = async (route, body, account) => {
  const path = `/api/telegram/${route}`;
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  Object.assign(req, {
    method: 'POST',
    url: path,
    headers: { 'content-type': 'application/json', host: '127.0.0.1:8787' },
  });
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
