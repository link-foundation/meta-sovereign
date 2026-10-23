/**
 * Reading from the GitHub API politely (R-Z11).
 *
 *   - Every list follows the `Link: rel="next"` header until there is no
 *     next page; a visited-url guard and a very high safety cap stop a
 *     server that loops (no page counting).
 *   - `ETag` / `Last-Modified` come back so the caller can ask again with
 *     `If-None-Match` / `If-Modified-Since`; a `304` costs no rate limit.
 *   - `x-ratelimit-remaining` / `x-ratelimit-reset` and the secondary limit's
 *     `retry-after` are respected: a short wait is slept (and the request
 *     repeated, a read is safe to repeat), a long one is reported as a
 *     `rate-limited` error carrying `retryAfter` seconds. Never a crash and
 *     never a busy loop.
 *
 * Only reads go through here; writes keep `requestJson` (./http.js), which
 * marks an ambiguous outcome and is never repeated.
 */

import { codedError, timedRequest } from './http.js';

const CODES = { 401: 'unauthorized', 404: 'not-found' };
const SAFETY_MAX_PAGES = 2000;
const DEFAULT_MAX_WAIT_MS = 60_000;
const DEFAULT_SECONDARY_WAIT_MS = 60_000;

export const parseLinkHeader = (header) => {
  const out = {};
  if (!header) {
    return out;
  }
  for (const part of String(header).split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="?([^";\s]+)"?/);
    if (match) {
      out[match[2]] = match[1];
    }
  }
  return out;
};

export const headerValue = (headers, name) => {
  if (!headers) {
    return null;
  }
  if (typeof headers.get === 'function') {
    return headers.get(name) ?? headers.get(name.toLowerCase()) ?? null;
  }
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
};

const numberHeader = (headers, name) => {
  const raw = headerValue(headers, name);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : null;
};

const parseBody = (text) => {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const itemsOf = (body) => {
  if (Array.isArray(body)) {
    return body;
  }
  return body ? [body] : [];
};

// Add a page's items; true when the sorted list reached the cursor.
const takeItems = (page, items, until) => {
  for (const item of itemsOf(page.body)) {
    if (until?.(item)) {
      return true;
    }
    items.push(item);
  }
  return false;
};

const isRateLimited = (res, text) => {
  if (res.status === 429) {
    return true;
  }
  if (res.status !== 403) {
    return false;
  }
  return (
    headerValue(res.headers, 'retry-after') !== null ||
    headerValue(res.headers, 'x-ratelimit-remaining') === '0' ||
    /rate limit|abuse/i.test(text)
  );
};

const rateLimitedError = (seconds, scope) =>
  Object.assign(
    codedError(
      `GitHub rate limit reached (${scope}); try again in ${seconds} s`,
      'rate-limited'
    ),
    { retryAfter: seconds, status: 429 }
  );

/**
 * @param {object} options
 * @param {Function} options.fetchImpl
 * @param {() => number} [options.now] milliseconds
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {number} [options.maxWaitMs] the longest wait slept; a longer one
 *   is reported to the caller instead
 * @param {number} [options.retries] repeats after a rate-limit wait
 */
export const createGithubHttp = ({
  fetchImpl,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  retries = 2,
  timeoutMs,
} = {}) => {
  const limit = { remaining: null, resetAt: 0 };

  const learn = (res) => {
    const remaining = numberHeader(res.headers, 'x-ratelimit-remaining');
    const reset = numberHeader(res.headers, 'x-ratelimit-reset');
    if (remaining !== null) {
      limit.remaining = remaining;
    }
    if (reset !== null) {
      limit.resetAt = reset * 1000;
    }
  };

  // How long to stay quiet after a refusal.
  const waitAfter = (res) => {
    const retry = numberHeader(res.headers, 'retry-after');
    if (retry !== null) {
      return { ms: retry * 1000, scope: 'secondary' };
    }
    if (limit.remaining === 0 && limit.resetAt > now()) {
      return { ms: limit.resetAt - now(), scope: 'primary' };
    }
    return { ms: DEFAULT_SECONDARY_WAIT_MS, scope: 'secondary' };
  };

  const pauseOrThrow = async (ms, scope) => {
    if (ms > maxWaitMs) {
      throw rateLimitedError(Math.ceil(ms / 1000), scope);
    }
    await sleep(Math.max(ms, 0));
  };

  // Spent budget: wait for the reset (or say how long) before asking.
  const beforeRequest = async () => {
    if (limit.remaining === 0 && limit.resetAt > now()) {
      await pauseOrThrow(limit.resetAt - now() + 1000, 'primary');
      limit.remaining = null;
    }
  };

  const once = (url, { headers, method, body, etag, lastModified }) => {
    const conditional = {
      ...headers,
      ...(etag ? { 'If-None-Match': etag } : {}),
      ...(lastModified ? { 'If-Modified-Since': lastModified } : {}),
    };
    return timedRequest(
      fetchImpl,
      url,
      {
        method,
        headers: conditional,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
      { timeoutMs, write: false },
      async (res) => ({ res, text: res.status === 304 ? '' : await res.text() })
    );
  };

  // What a good answer carries: the body and the headers worth keeping.
  const answer = (res, text, settings) => ({
    status: res.status,
    notModified: res.status === 304,
    body: res.status === 304 ? null : parseBody(text),
    etag: headerValue(res.headers, 'ETag') ?? settings.etag ?? null,
    lastModified:
      headerValue(res.headers, 'Last-Modified') ??
      (res.status === 304 ? (settings.lastModified ?? null) : null),
    next:
      res.status === 304
        ? null
        : (parseLinkHeader(headerValue(res.headers, 'Link')).next ?? null),
    pollInterval: numberHeader(res.headers, 'X-Poll-Interval'),
  });

  /**
   * One read. Resolves `{ status, body, notModified, etag, lastModified,
   * next, pollInterval }`; throws on a refusal (`rate-limited` carries
   * `retryAfter`).
   */
  const request = async (url, options = {}) => {
    const settings = { method: 'GET', ...options };
    for (let attempt = 0; ; attempt += 1) {
      await beforeRequest();
      const { res, text } = await once(url, settings);
      learn(res);
      if (res.status === 304 || res.ok) {
        return answer(res, text, settings);
      }
      if (isRateLimited(res, text)) {
        const { ms, scope } = waitAfter(res);
        if (attempt >= retries || ms > maxWaitMs) {
          throw rateLimitedError(Math.ceil(ms / 1000), scope);
        }
        await sleep(ms);
        continue;
      }
      throw Object.assign(
        new Error(`HTTP ${res.status} ${res.statusText}: ${text}`),
        { status: res.status, code: CODES[res.status] ?? 'github-error' }
      );
    }
  };

  /**
   * Every page of a list. `until(item)` true on a sorted list ends the walk
   * (the rest is older than the cursor). The first page may be conditional
   * (`etag`): then `notModified` is true and `items` is empty.
   */
  const pages = async (url, options = {}) => {
    const { until, maxPages = SAFETY_MAX_PAGES, ...first } = options;
    const items = [];
    const seen = new Set();
    let target = url;
    let head = null;
    let count = 0;
    while (target && !seen.has(target) && count < maxPages) {
      seen.add(target);
      const page = await request(
        target,
        count === 0
          ? first
          : { headers: first.headers, method: first.method ?? 'GET' }
      );
      head ??= page;
      count += 1;
      if (page.notModified) {
        return { items, notModified: true, etag: head.etag, head };
      }
      target = takeItems(page, items, until) ? null : page.next;
    }
    return {
      items,
      notModified: false,
      etag: head?.etag ?? null,
      lastModified: head?.lastModified ?? null,
      head,
    };
  };

  return { request, pages, limit };
};
