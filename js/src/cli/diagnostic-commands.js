import { setTimeout as delay } from 'node:timers/promises';
import { LINO_TEXT, readWireResponse, encodeWire } from '../transport/lino.js';
import { isDiagnosticBatch } from '../transport/diagnostic-batch.js';
import { isDiagnosticSettings } from '../transport/diagnostic-settings.js';
import { verboseFlag } from '../server/log-settings.js';

const readSettingsCommand = async (args, log, fetchImpl) => {
  const url = endpointFor(args.url);
  url.pathname = '/api/diagnostics/settings';
  const verbose = verboseFlag(args.verbose);
  const response = await fetchImpl(
    url,
    verbose === undefined
      ? {
          headers: { accept: LINO_TEXT },
        }
      : {
          method: 'POST',
          headers: { accept: LINO_TEXT, 'content-type': LINO_TEXT },
          body: encodeWire({ verbose }, LINO_TEXT),
        }
  );
  const answer = await readWireResponse(response);
  if (
    !response.ok ||
    !isDiagnosticSettings(answer) ||
    (verbose !== undefined && answer.verbose !== verbose)
  ) {
    log(
      'Diagnostic settings were not confirmed. Read settings again before retrying.'
    );
    return 1;
  }
  log(encodeWire(answer, LINO_TEXT));
  return 0;
};

const settingsCommand = async (args, log, fetchImpl) => {
  try {
    return await readSettingsCommand(args, log, fetchImpl);
  } catch {
    log(
      'Diagnostic settings unavailable; check the address and verbose option, then read settings again.'
    );
    return 1;
  }
};

const endpointFor = (value) => {
  const url = new URL(value ?? 'http://127.0.0.1:8787');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'diagnostics URL must be an HTTP(S) origin without credentials'
    );
  }
  return new URL('/api/diagnostics/logs', url);
};

const readBatch = async (fetchImpl, url, signal) => {
  const response = await fetchImpl(url, {
    headers: { accept: LINO_TEXT },
    signal,
  });
  if (!response.ok) {
    throw new Error('diagnostics unavailable');
  }
  const batch = await readWireResponse(response);
  if (!isDiagnosticBatch(batch)) {
    throw new Error('invalid diagnostics response');
  }
  return batch;
};

const validateArgs = (args) => {
  if (args._?.join(' ') !== 'logs') {
    throw new Error(
      'use diagnostics logs [--url=<server-origin>] [--after=0] [--follow]'
    );
  }
  const cursor = Number(args.after ?? 0);
  if (
    !Number.isSafeInteger(cursor) ||
    cursor < 0 ||
    (args.follow !== undefined && typeof args.follow !== 'boolean')
  ) {
    throw new Error('invalid diagnostics cursor or follow flag');
  }
  return cursor;
};

const createLogCommands = ({
  fetchImpl = fetch,
  signals = process,
  wait = delay,
} = {}) => ({
  diagnostics: async (args, log) => {
    const url = endpointFor(args.url);
    let cursor = validateArgs(args);
    const controller = new AbortController();
    const stop = () => controller.abort();
    signals.once('SIGINT', stop);
    signals.once('SIGTERM', stop);
    let session = null;
    let unavailable = false;
    try {
      do {
        url.searchParams.set('after', String(cursor));
        if (session) {
          url.searchParams.set('session', session);
        }
        try {
          const batch = await readBatch(fetchImpl, url, controller.signal);
          if (controller.signal.aborted) {
            break;
          }
          if (batch.dropped) {
            log('Older diagnostic entries were discarded.');
          }
          for (const item of batch.items) {
            log(item.text);
          }
          cursor = batch.cursor;
          session = batch.session;
          unavailable = false;
        } catch {
          if (controller.signal.aborted) {
            break;
          }
          if (!args.follow) {
            log(
              'Diagnostics unavailable; check the server address and unlock the app if required.'
            );
            return 1;
          }
          if (!unavailable) {
            log('Diagnostics unavailable; reconnecting.');
            unavailable = true;
          }
        }
        if (args.follow) {
          await wait(2000, undefined, { signal: controller.signal });
        }
      } while (args.follow && !controller.signal.aborted);
      return 0;
    } catch (error) {
      if (controller.signal.aborted) {
        return 0;
      }
      throw error;
    } finally {
      signals.removeListener('SIGINT', stop);
      signals.removeListener('SIGTERM', stop);
    }
  },
});

export const createDiagnosticCommands = (options = {}) => {
  const logs = createLogCommands(options);
  return {
    diagnostics: (args, log) =>
      args._?.join(' ') === 'settings'
        ? settingsCommand(args, log, options.fetchImpl ?? fetch)
        : logs.diagnostics(args, log),
  };
};
