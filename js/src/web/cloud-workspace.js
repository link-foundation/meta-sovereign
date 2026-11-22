// The workspace HTML pins every tab to its own server origin.
export const workspaceName = () =>
  globalThis.document?.querySelector('meta[name="ms-cloud"]')?.content || null;

const SIGN_IN = '/_cloud/sign-in';
let leaving = false;

const returnToSignIn = () => {
  if (!leaving) {
    leaving = true;
    const app = globalThis.document.getElementById('app');
    if (app) {
      app.hidden = true;
    }
    globalThis.location.replace(SIGN_IN);
  }
};

export const workspaceFetch = async (url, init) => {
  const target = new URL(url, globalThis.location.href);
  if (target.origin !== globalThis.location.origin) {
    throw new Error('Workspace requests must use the workspace origin');
  }
  const response = await globalThis.fetch(target, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
  });
  if (
    response.status === 401 &&
    response.headers.get('x-ms-workspace-session') === 'required'
  ) {
    returnToSignIn();
  }
  return response;
};

export const watchWorkspaceSession = () => {
  if (!workspaceName()) {
    return;
  }
  const check = () => {
    if (globalThis.document.visibilityState !== 'hidden') {
      workspaceFetch('/_cloud/session').catch(() => {});
    }
  };
  const timer = globalThis.setInterval(check, 60_000);
  globalThis.addEventListener('pageshow', check);
  globalThis.document.addEventListener('visibilitychange', check);
  return () => {
    globalThis.clearInterval(timer);
    globalThis.removeEventListener('pageshow', check);
    globalThis.document.removeEventListener('visibilitychange', check);
  };
};

const linkPath = (id) => `/links/${encodeURIComponent(id)}`;

const expectJson = async (response) => {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw Object.assign(
      new Error(
        body?.error ?? 'The workspace server did not confirm the change'
      ),
      { code: body?.code ?? 'workspace-request-failed' }
    );
  }
  return body;
};

// Customer content stays on the server. The client reads through its
// established API layer, and writes go straight to the workspace store.
export const createWorkspaceStore = (request) => ({
  query: async () => [],
  async get(id) {
    const response = await request(linkPath(id));
    return response.status === 404 ? null : expectJson(response);
  },
  put: async (link) =>
    expectJson(
      await request('/links', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(link),
      })
    ),
  async delete(id) {
    const response = await request(linkPath(id), { method: 'DELETE' });
    return response.status === 404 ? false : (await expectJson(response)).ok;
  },
});
