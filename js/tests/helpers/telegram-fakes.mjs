// Fakes the Telegram action tests share: API classes that remember their
// fields, a client answering from a function, Telegram's errors, and a
// POST through the Telegram routes. Nothing reaches a network.

import { Readable } from 'node:stream';
import { handleTelegramRoutes } from '../../src/server/routes-telegram.js';

/** A fake `Api.X` class: its fields and a `className`. */
export const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

export class CustomFile {
  constructor(name, size, path) {
    Object.assign(this, { name, size, path });
  }
}

export const helpers = { returnBigInt: (v) => BigInt(v) };

export const telegramError = (errorMessage) =>
  Object.assign(new Error(errorMessage), { errorMessage });

/** A client logging each request; an `Error` answer is thrown. */
export const fakeClient = (answer, log) => ({
  invoke: async (request) => {
    log.push(request);
    const next = answer(request);
    if (next instanceof Error) {
      throw next;
    }
    return next;
  },
  uploadFile: async ({ file }) => ({ className: 'InputFile', file }),
});

/** POSTs `body` to a Telegram route; resolves to `{ status }`. */
export const post = async (route, body, account) => {
  const path = `/api/telegram/${route}`;
  const req = Object.assign(
    Readable.from([Buffer.from(JSON.stringify(body))]),
    {
      method: 'POST',
      url: path,
      headers: { 'content-type': 'application/json', host: '127.0.0.1:8787' },
    }
  );
  const answered = {};
  const res = {
    setHeader() {},
    writeHead(code) {
      answered.status = code;
    },
    end() {},
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return answered;
};
