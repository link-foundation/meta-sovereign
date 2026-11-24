import { LINO_TEXT, encodeWire } from '../transport/lino.js';
import { cliServerClient, localOrSecureOrigin } from './server-lino-client.js';

const usage =
  'Use auto-import status [--id=<job>] | start --source=<provider> [--slot=<slot>] | capture --id=<job> [--history] | stop --id=<job> [--url=<server-origin>] [--binary]';

const bodyFor = (action, args) => {
  if (action === 'start') {
    return { provider: args.source, browserSlot: args.slot };
  }
  return action === 'capture' && args.history === true ? { history: true } : {};
};

const validHistoryFlag = (action, history) =>
  history === undefined || (action === 'capture' && history === true);

const pathFor = (id, action) => {
  if (!id) {
    return '/api/auto-import';
  }
  const job = `/api/auto-import/jobs/${id}`;
  return action === 'status' ? job : `${job}/${action}`;
};

const commandFor = (args) => {
  const action = args._?.join(' ') || 'status';
  if (
    !['status', 'start', 'capture', 'stop'].includes(action) ||
    (action === 'start' && (!args.source || args.id !== undefined)) ||
    (['capture', 'stop'].includes(action) && !args.id) ||
    (args.id !== undefined && !/^[a-z0-9-]+$/i.test(args.id)) ||
    !validHistoryFlag(action, args.history)
  ) {
    return null;
  }
  return {
    path: pathFor(args.id, action),
    body: action === 'status' ? undefined : bodyFor(action, args),
  };
};

export const autoImportCmd = async (args, log) => {
  const command = commandFor(args);
  if (!command) {
    log(usage);
    return 1;
  }
  try {
    const origin = localOrSecureOrigin(args.url);
    if (!origin) {
      log('Use an HTTPS or loopback HTTP server origin.');
      return 1;
    }
    const request = cliServerClient(origin, args.binary === true);
    const { ok, answer: result } = await request(command.path, command.body);
    log(encodeWire(result, LINO_TEXT));
    if (args.history && result?.historyCapture?.coverage?.complete !== true) {
      return 1;
    }
    return ok && result?.state !== 'failed' ? 0 : 1;
  } catch {
    log(
      'Browser import could not reach the server or read its response. Check status before retrying.'
    );
    return 1;
  }
};
