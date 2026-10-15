// A tiny JSON POST helper for route tests: send a JSON body (optionally with
// extra headers, e.g. a foreign Origin) and, with postJson, read the reply.

export const post = (base, p, body, headers = {}) =>
  fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

export const postJson = (base, p, body) =>
  post(base, p, body).then((r) => r.json());
