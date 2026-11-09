const offline = () => ({
  ok: false,
  code: 'server-required',
  status: 'unavailable',
});
const path = (name) => `/api/broadcast/${name}`;
const uncertain = (answer) =>
  answer?.code === 'network' || answer?.httpStatus >= 500;

/** Reads recover through the shared transport. Writes are never replayed. */
export const createPublicationApi = ({ request, confirmed }) => {
  const call = async (name, method = 'GET', body) => {
    const response = await request(
      path(name),
      {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
      },
      { network: true, read: name === 'test' || name === 'preview' }
    );
    if (!response) {
      return offline();
    }
    const data = await response.json().catch(() => null);
    return data ? { ...data, httpStatus: response.status } : offline();
  };
  const write = async (name, body, ask) => {
    const answer = await confirmed(path(name), body, ask, { network: true });
    if (!answer) {
      return offline();
    }
    return uncertain(answer)
      ? { ...answer, ok: false, status: 'unknown' }
      : answer;
  };
  return {
    targets: () => call('targets'),
    saveTarget: (target) => call('targets', 'PUT', { target }),
    removeTarget: (id) =>
      call(`targets?id=${encodeURIComponent(id)}`, 'DELETE'),
    credentials: (network) =>
      call(`credentials?network=${encodeURIComponent(network)}`),
    saveCredentials: (network, credentials) =>
      call('credentials', 'PUT', { network, credentials }),
    test: (targetId) => call('test', 'POST', { targetId }),
    preview: (body) => call('preview', 'POST', body),
    publish: (body, ask) => write('publish', body, ask),
    history: () => call('history'),
    delete: (body, ask) => write('delete', body, ask),
  };
};
