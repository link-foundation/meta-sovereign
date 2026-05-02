/**
 * Small HTTP helpers shared by live source adapters.
 *
 * The adapters keep endpoint defaults close to their networks, while
 * tests inject `fetchImpl` and `baseUrl` so no real credentials or
 * network access are required for verification.
 */

export const envValue = (name) => {
  try {
    if (globalThis.process?.env?.[name]) {
      return globalThis.process.env[name];
    }
  } catch {
    // Ignore non-Node runtimes that expose a partial process shim.
  }
  try {
    return globalThis.Deno?.env?.get(name) ?? null;
  } catch {
    return null;
  }
};

export const resolveOption = (value, envName, label) => {
  const resolved = value ?? (envName ? envValue(envName) : null);
  if (!resolved) {
    throw new Error(`${label} is required`);
  }
  return resolved;
};

export const contentText = (content) => {
  if (typeof content === 'string') {
    return content;
  }
  return (
    content?.text ??
    content?.body ??
    content?.message ??
    content?.description ??
    ''
  );
};

export const contentTarget = (content) =>
  typeof content === 'object'
    ? (content.to ?? content.chat ?? content.chatId ?? content.peerId ?? null)
    : null;

export const compact = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  );

export const addSearch = (url, search = {}) => {
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
};

const parseResponseBody = async (res) => {
  const text = await res.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const requestJson = async (
  fetchImpl,
  url,
  { method = 'GET', headers = {}, search = null, body = undefined } = {}
) => {
  const target = addSearch(new URL(url), search ?? {});
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    if (body instanceof URLSearchParams || typeof body === 'string') {
      init.body = body;
    } else {
      init.headers['Content-Type'] ??= 'application/json';
      init.body = JSON.stringify(body);
    }
  }
  const res = await fetchImpl(target, init);
  const parsed = await parseResponseBody(res);
  if (!res.ok) {
    const detail =
      typeof parsed === 'string' ? parsed : JSON.stringify(parsed ?? {});
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${detail}`);
  }
  return parsed;
};

export const authHeaders = (token, prefix = 'Bearer') => ({
  Authorization: `${prefix} ${token}`,
});
