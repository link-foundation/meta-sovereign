import { addSearch, envValue, requestJson } from './http.js';

// Opt-in diagnostics contain method, auth mode and outcome only. Credentials,
// headers, target identifiers, draft text and provider error bodies stay out.
export const createXRequest = ({
  fetchImpl,
  baseUrl,
  auth,
  debug,
  debugLog = (entry) => console.debug(JSON.stringify(entry)),
}) => {
  const enabled = debug ?? envValue('META_SOVEREIGN_X_DEBUG') === '1';
  const trace = (entry) => {
    if (enabled) {
      debugLog({ event: 'x.request', ...entry });
    }
  };
  return async (path, { search, ...init }, options) => {
    const url = addSearch(new URL(`${baseUrl}${path}`), search);
    const method = init.method ?? 'GET';
    const headers = await auth.headers(url, { ...init, options });
    const mode = auth.status(options).mode;
    trace({ phase: 'begin', method, mode });
    try {
      const result = await requestJson(fetchImpl, url, { ...init, headers });
      trace({ phase: 'response', method, mode });
      return result;
    } catch (error) {
      trace({
        phase: 'error',
        method,
        mode,
        status: Number.isInteger(error.status) ? error.status : null,
        uncertain: error.ambiguous === true,
      });
      throw error;
    }
  };
};
