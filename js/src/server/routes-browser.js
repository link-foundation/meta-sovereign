import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import {
  BROWSER_CASES,
  listBrowserPolicies,
  resolveBrowserPolicy,
  saveBrowserPolicy,
} from '../browser/policy.js';

export const handleBrowserRoutes = async (store, req, res, p, url, ctx) => {
  if (p !== '/api/browser/policies') {
    return false;
  }
  try {
    if (req.method === 'GET') {
      const target = Object.fromEntries(url.searchParams);
      json(res, 200, {
        ok: true,
        available: true,
        cases: BROWSER_CASES,
        policies: await listBrowserPolicies(store),
        resolved: await resolveBrowserPolicy(store, target),
      });
      return true;
    }
    if (req.method === 'POST') {
      if (!isTrustedMutation(req, ctx?.allowOrigins)) {
        json(res, 403, { error: 'untrusted request', code: 'forbidden' });
        return true;
      }
      const policy = await saveBrowserPolicy(store, await readBody(req));
      json(res, 200, { ok: true, policy });
      return true;
    }
    json(res, 405, { error: 'use GET or POST' });
  } catch (error) {
    if (error.code !== 'bad-browser-policy') {
      throw error;
    }
    json(res, 400, { error: error.message, code: error.code });
  }
  return true;
};
