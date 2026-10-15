/**
 * Tiny request/response helpers shared by route modules. Keeping these
 * separate lets each route file stay focused and well below the
 * eslint complexity budget.
 */

// JSON.stringify throws on a BigInt ("Do not know how to serialize a
// BigInt"), which some upstream libraries (GramJS account ids) hand us —
// render those as strings so one stray BigInt can never fail a response.
const jsonSafe = (_key, value) =>
  typeof value === 'bigint' ? value.toString() : value;

export const json = (res, status, body) => {
  // Never write twice: a slow handler whose client already gave up (or a
  // late error after a response was sent) must not throw ERR_HTTP_HEADERS_
  // SENT, which would otherwise crash the whole server process.
  if (res.headersSent || res.writableEnded) {
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body, jsonSafe));
};

export const text = (res, status, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
};

export const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
