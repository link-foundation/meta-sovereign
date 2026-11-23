import {
  LINO_BINARY,
  LINO_TEXT,
  encodeWire,
  readWireResponse,
} from '../transport/lino.js';

const usage =
  'Use auto-import status [--id=<job>] | start --source=<provider> [--slot=<slot>] | capture --id=<job> | stop --id=<job> [--url=<server-origin>] [--binary]';

const commandFor = (args) => {
  const action = args._?.join(' ') || 'status';
  if (
    !['status', 'start', 'capture', 'stop'].includes(action) ||
    (action === 'start' && (!args.source || args.id !== undefined)) ||
    (['capture', 'stop'].includes(action) && !args.id) ||
    (args.id !== undefined && !/^[a-z0-9-]+$/i.test(args.id))
  ) {
    return null;
  }
  const path = args.id
    ? `/api/auto-import/jobs/${args.id}`
    : '/api/auto-import';
  const read = action === 'status';
  return {
    path: args.id && !read ? `${path}/${action}` : path,
    read,
    body:
      action === 'start'
        ? { provider: args.source, browserSlot: args.slot }
        : {},
  };
};

const serverOrigin = (value) => {
  const url = new URL(value ?? 'http://127.0.0.1:8787');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  return url;
};

export const autoImportCmd = async (args, log) => {
  const command = commandFor(args);
  if (!command) {
    log(usage);
    return 1;
  }
  try {
    const origin = serverOrigin(args.url);
    if (!origin) {
      log('Use an HTTPS or loopback HTTP server origin.');
      return 1;
    }
    const type = args.binary === true ? LINO_BINARY : LINO_TEXT;
    const response = await fetch(new URL(command.path, origin), {
      redirect: 'error',
      headers: {
        accept: type,
        ...(!command.read ? { 'content-type': type } : {}),
      },
      ...(!command.read
        ? { method: 'POST', body: encodeWire(command.body, type) }
        : {}),
    });
    const result = await readWireResponse(response);
    log(encodeWire(result, LINO_TEXT));
    return response.ok && result?.state !== 'failed' ? 0 : 1;
  } catch {
    log(
      'Browser import could not reach the server or read its response. Check status before retrying.'
    );
    return 1;
  }
};
