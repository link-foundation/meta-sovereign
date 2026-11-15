/** Only absent/unsupported routes may use local VK settings as a fallback. */
export const createVkRead = (request) => async (path, init, options) => {
  const response = await request(path, init, { ...options, network: true });
  if (!response || response.status === 404) {
    return null;
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || Array.isArray(data) || data.ok !== true) {
    return { ok: false, code: 'server-read-unconfirmed' };
  }
  return data;
};
