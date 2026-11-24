import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { encodeWire, LINO_TEXT } from '../transport/lino.js';
import { cliServerClient, localOrSecureOrigin } from './server-lino-client.js';

const usage =
  'Use chat read --id=<saved-message> or chat send --source=<provider> --chat=<address> (--text=<message> | --text-file=<path>) --confirm [--reference=<saved-hh-message>] [--client-id=<id>] [--url=<server-origin>] [--binary]';

const commonOptions = ['_', 'store', 'url', 'binary'];
const readOptions = [...commonOptions, 'id'];
const sendOptions = [
  ...commonOptions,
  'source',
  'chat',
  'text',
  'text-file',
  'confirm',
  'reference',
  'client-id',
];
const hasText = (value) => typeof value === 'string' && Boolean(value.trim());
const switches = [true, 'true'];

const draftText = async ({ text, 'text-file': file }) => {
  if (file === undefined) {
    return text;
  }
  return text === undefined && hasText(file) ? readFile(file, 'utf8') : null;
};

const sendDraft = async (args) => {
  const { source, chat, reference, 'client-id': clientId } = args;
  if (
    !hasText(source) ||
    !hasText(chat) ||
    !switches.includes(args.confirm) ||
    (reference !== undefined && (source !== 'hh' || !hasText(reference))) ||
    (clientId !== undefined && (!hasText(clientId) || clientId.length > 100))
  ) {
    return null;
  }
  const text = await draftText(args);
  return hasText(text)
    ? {
        source,
        chat,
        text,
        clientId: clientId ?? randomUUID(),
        ...(reference === undefined ? {} : { hhBrowserMessage: reference }),
      }
    : null;
};

const codeOf = (answer, fallback) =>
  typeof answer?.code === 'string' && /^[a-z0-9-]{1,64}$/u.test(answer.code)
    ? answer.code
    : fallback;

const resultOf = (log, success, receipt) => {
  log(encodeWire(receipt, LINO_TEXT));
  return success ? 0 : 1;
};

const readChat = async (id, request, log) => {
  const { ok, answer } = await request('/api/message/read', { ids: [id] });
  const read = ok && answer?.ok === true && answer.read !== false;
  return resultOf(log, read, {
    id,
    read,
    ...(read
      ? { via: answer.via, unreadCount: answer.readState?.unreadCount }
      : { code: codeOf(answer, 'read-unconfirmed') }),
  });
};

const sendChat = async (draft, request, log) => {
  const { status, answer: preview } = await request('/api/send', draft);
  const token = preview?.confirm?.token;
  if (
    status !== 428 ||
    preview?.action !== 'message.send' ||
    !hasText(token) ||
    !Object.entries(draft).every(
      ([key, value]) => preview.preview?.[key] === value
    )
  ) {
    return resultOf(log, false, {
      status: 'unconfirmed',
      code: codeOf(preview, 'confirmation-unavailable'),
      clientId: draft.clientId,
    });
  }
  const { ok, answer } = await request('/api/send', {
    ...draft,
    confirmToken: token,
  });
  const sent = ok && answer?.status === 'sent';
  return resultOf(log, sent, {
    status: sent ? 'sent' : 'unconfirmed',
    clientId: draft.clientId,
    ...(sent
      ? {
          id: answer.link?.id,
          via: answer.via,
          delivery: answer.link?.delivery,
          stored: answer.stored,
        }
      : { code: codeOf(answer, 'send-unconfirmed') }),
  });
};

const validOptions = (action, args) => {
  const allowed = action === 'read' ? readOptions : sendOptions;
  return (
    ['read', 'send'].includes(action) &&
    Object.keys(args).every((key) => allowed.includes(key)) &&
    (args.binary === undefined || switches.includes(args.binary)) &&
    (action !== 'read' || hasText(args.id))
  );
};

export const chatCmd = async (args, log) => {
  const action = args._?.join(' ');
  if (!validOptions(action, args)) {
    log(usage);
    return 1;
  }
  let draft;
  try {
    if (action === 'send') {
      draft = await sendDraft(args);
      if (!draft) {
        log(usage);
        return 1;
      }
    }
  } catch {
    log('The message file could not be read.');
    return 1;
  }
  try {
    const origin = localOrSecureOrigin(args.url);
    if (!origin) {
      log('Use an HTTPS or loopback HTTP server origin.');
      return 1;
    }
    const request = cliServerClient(origin, switches.includes(args.binary));
    return await (action === 'read'
      ? readChat(args.id, request, log)
      : sendChat(draft, request, log));
  } catch {
    return resultOf(log, false, {
      status: 'unconfirmed',
      code: 'chat-server-unavailable',
      ...(draft ? { clientId: draft.clientId } : { id: args.id }),
    });
  }
};
