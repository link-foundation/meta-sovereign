/**
 * Email over the network (issue #3; R-Z5).
 *
 * Gmail, Microsoft Graph and JMAP are plain HTTP and can run in the SPA
 * when CORS allows it. IMAP, POP3 and SMTP need a local server transport
 * (./email-node-transport.js registers itself here with
 * `setEmailTransportFactory`) because browsers cannot open mail sockets.
 *
 * `emailSource.live` is what the rest of the app calls (Chat's composer,
 * automations, `/api/message/read`): it takes the saved connection's
 * options (token, host, login, password… see ./email-store.js), picks the
 * protocol they describe and does the action. A reply carries the
 * thread's ids (In-Reply-To, References, Gmail `threadId`, Graph's reply
 * call, JMAP `inReplyTo`). Pulls skip what is already stored or start
 * after what was seen (`options.sync`), so a pull is not a re-download.
 */

import { authHeaders, envValue, markSendOutcome, requestJson } from './http.js';
import { composeMessage } from './email-compose.js';
import { baseSubject, normalizeAddress } from './email-mime.js';
import {
  normalizeEmailRecord,
  normalizeGmailMessage,
  normalizeGraphMessage,
  normalizeJmapMessage,
  utf8ToBase64Url,
} from './email-records.js';

export const EMAIL_PROTOCOLS = [
  'jmap',
  'gmail',
  'microsoft-graph',
  'imap',
  'pop3',
  'smtp',
];

const RAW_PROTOCOLS = new Set(['imap', 'pop3', 'smtp']);

const coded = (message, code, extra = {}) =>
  Object.assign(new Error(message), { code, ...extra });

const tokenFor = (protocol, override, configured) => {
  const envNames = {
    gmail: 'GMAIL_ACCESS_TOKEN',
    'microsoft-graph': 'MICROSOFT_GRAPH_ACCESS_TOKEN',
    jmap: 'JMAP_ACCESS_TOKEN',
    imap: 'EMAIL_ACCESS_TOKEN',
    pop3: 'EMAIL_ACCESS_TOKEN',
    smtp: 'EMAIL_ACCESS_TOKEN',
  };
  const token =
    override ??
    configured ??
    envValue(envNames[protocol]) ??
    envValue('EMAIL_ACCESS_TOKEN');
  if (!token) {
    throw coded(`${protocol} email access token is required`, 'no-token');
  }
  return token;
};

const requireFetch = (fetchImpl, protocol) => {
  if (!fetchImpl) {
    throw new Error(`${protocol} email API requires fetch`);
  }
};

const localServerRequired = (protocol, method) =>
  coded(
    `${protocol} ${method} requires a local server transport; browsers cannot open raw mail TCP/TLS sockets`,
    'LOCAL_SERVER_REQUIRED',
    { protocol }
  );

const rootUrl = (baseUrl, fallback) => {
  const value = String(baseUrl ?? fallback);
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
};

// An HTTP failure with its status, so a caller can tell "slow down" apart.
const call = async (...args) => {
  try {
    return await requestJson(...args);
  } catch (error) {
    const status = Number(/^HTTP (\d{3})/.exec(error.message)?.[1]);
    if (status === 429) {
      throw coded(error.message, 'rate-limited', { status, cause: error });
    }
    if (status === 401 || status === 403) {
      throw coded(error.message, 'unauthorized', { status, cause: error });
    }
    throw error;
  }
};

// A SEND that failed after the request left (reset, 5xx, timeout) may have
// been delivered: report it as `send-unknown`, never retried or sent another
// way (R-Z4 / R-Z1). A clear refusal (4xx) keeps its own code.
const sendCall = async (...args) => {
  try {
    return await call(...args);
  } catch (error) {
    if (error?.ambiguous !== true) {
      throw error;
    }
    throw Object.assign(markSendOutcome(error, { ambiguous: true }), {
      code: 'send-unknown',
      outcome: 'unknown',
      fallback: false,
    });
  }
};

const createEmailContext = ({
  protocol = 'jmap',
  provider = protocol,
  token = null,
  fetchImpl = globalThis.fetch,
  baseUrl = null,
  accountId = null,
  userId = 'me',
  transport = null,
} = {}) => ({
  protocol: String(protocol).toLowerCase(),
  provider,
  token,
  fetchImpl,
  baseUrl,
  accountId,
  userId,
  transport,
  session: null,
  boxes: null,
});

// ---- Gmail ------------------------------------------------------------------

const isKnown = async (options, externalId) =>
  Boolean(await options.sync?.has?.(`msg:email:${externalId}`));

const pullGmailEmail = async (ctx, options = {}) => {
  requireFetch(ctx.fetchImpl, 'gmail');
  const root = rootUrl(ctx.baseUrl, 'https://gmail.googleapis.com');
  const auth = authHeaders(tokenFor('gmail', options.token, ctx.token));
  const user = options.userId ?? ctx.userId;
  const listed = await call(
    ctx.fetchImpl,
    `${root}/gmail/v1/users/${user}/messages`,
    {
      headers: auth,
      search: {
        maxResults: options.limit ?? 20,
        pageToken: options.offset,
        labelIds: options.label ?? options.mailbox ?? 'INBOX',
        q: options.query,
      },
    }
  );
  const messages = [];
  for (const item of listed.messages ?? []) {
    // A mail already in the store is not downloaded again.
    if (await isKnown(options, item.id)) {
      continue;
    }
    messages.push(
      await call(
        ctx.fetchImpl,
        `${root}/gmail/v1/users/${user}/messages/${item.id}`,
        { headers: auth, search: { format: options.format ?? 'full' } }
      )
    );
  }
  const links = messages.map(normalizeGmailMessage);
  return {
    links,
    rawCount: listed.messages?.length ?? links.length,
    nextOffset: listed.nextPageToken ?? null,
    raw: listed,
  };
};

const gmailAttachment = async (ctx, link, attachment, options) => {
  const root = rootUrl(ctx.baseUrl, 'https://gmail.googleapis.com');
  const user = options.userId ?? ctx.userId;
  const got = await call(
    ctx.fetchImpl,
    `${root}/gmail/v1/users/${user}/messages/${providerId(link, tailOf(link))}/attachments/${attachment.remote.attachmentId}`,
    { headers: authHeaders(tokenFor('gmail', options.token, ctx.token)) }
  );
  return base64UrlBytes(got.data);
};

const base64UrlBytes = (data) =>
  Uint8Array.from(
    globalThis.atob(
      String(data ?? '')
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(String(data ?? '').length / 4) * 4, '=')
    ),
    (c) => c.charCodeAt(0)
  );

// ---- Microsoft Graph ----------------------------------------------------------

const graphSelectFields = [
  'id',
  'conversationId',
  'internetMessageId',
  'internetMessageHeaders',
  'subject',
  'sender',
  'from',
  'toRecipients',
  'ccRecipients',
  'bccRecipients',
  'body',
  'bodyPreview',
  'hasAttachments',
  'isRead',
  'receivedDateTime',
  'sentDateTime',
];

const graphSearchParams = (target, root, options, since) =>
  target === `${root}/me/messages`
    ? {
        $top: options.limit ?? 20,
        $select: options.select ?? graphSelectFields.join(','),
        $expand:
          'attachments($select=id,name,contentType,size,isInline,contentId)',
        // Only what came after the newest mail seen last time.
        ...(since
          ? {
              $filter: `receivedDateTime gt ${since}`,
              $orderby: 'receivedDateTime desc',
            }
          : { $orderby: 'receivedDateTime desc' }),
      }
    : null;

const newestTime = (links) =>
  links
    .map((l) => l.timestamp)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

const pullGraphEmail = async (ctx, options = {}) => {
  requireFetch(ctx.fetchImpl, 'microsoft-graph');
  const root = rootUrl(ctx.baseUrl, 'https://graph.microsoft.com/v1.0');
  const target = options.nextUrl ?? options.offset ?? `${root}/me/messages`;
  const key = 'graph:received';
  const since =
    target === `${root}/me/messages`
      ? (await options.sync?.get?.(key))?.at
      : null;
  const raw = await call(ctx.fetchImpl, target, {
    headers: {
      ...authHeaders(tokenFor('microsoft-graph', options.token, ctx.token)),
      Prefer: 'outlook.body-content-type="html"',
    },
    search: graphSearchParams(target, root, options, since),
  });
  const links = (raw.value ?? []).map(normalizeGraphMessage);
  const newest = newestTime(links);
  return {
    links,
    rawCount: raw.value?.length ?? links.length,
    nextOffset: raw['@odata.nextLink'] ?? null,
    raw,
    afterStore:
      newest && options.sync && target === `${root}/me/messages`
        ? () => options.sync.set(key, { at: newest })
        : undefined,
  };
};

const graphAttachment = async (ctx, link, attachment, options) => {
  const root = rootUrl(ctx.baseUrl, 'https://graph.microsoft.com/v1.0');
  const got = await call(
    ctx.fetchImpl,
    `${root}/me/messages/${providerId(link, tailOf(link))}/attachments/${attachment.remote.attachmentId}`,
    {
      headers: authHeaders(
        tokenFor('microsoft-graph', options.token, ctx.token)
      ),
    }
  );
  return base64UrlBytes(String(got.contentBytes ?? ''));
};

// ---- JMAP -------------------------------------------------------------------

const JMAP_USING = [
  'urn:ietf:params:jmap:core',
  'urn:ietf:params:jmap:mail',
  'urn:ietf:params:jmap:submission',
];

const sessionUrlOf = (base) =>
  /\/\.well-known\/jmap$|\/session$/.test(base)
    ? base
    : new URL('/.well-known/jmap', base).toString();

/**
 * Where the account is: with an `accountId` the base address is the API
 * itself (as before); without one the server's session document says
 * (apiUrl, the mail account, the download address).
 */
const jmapSession = async (ctx, options) => {
  const known = options.accountId ?? ctx.accountId;
  if (known) {
    return {
      accountId: known,
      apiUrl: rootUrl(
        ctx.baseUrl,
        options.apiUrl ?? 'https://jmap.example.invalid/jmap'
      ),
    };
  }
  if (ctx.session) {
    return ctx.session;
  }
  const base = ctx.baseUrl ?? options.apiUrl;
  if (!base) {
    throw coded(
      'jmap needs the server address (base-url); the account id is found from its session',
      'not-configured'
    );
  }
  requireFetch(ctx.fetchImpl, 'jmap');
  const raw = await call(ctx.fetchImpl, sessionUrlOf(base), {
    headers: authHeaders(tokenFor('jmap', options.token, ctx.token)),
  });
  const accountId =
    raw.primaryAccounts?.['urn:ietf:params:jmap:mail'] ??
    Object.keys(raw.accounts ?? {})[0];
  if (!accountId || !raw.apiUrl) {
    throw coded('jmap session has no mail account', 'not-configured');
  }
  ctx.session = {
    accountId,
    apiUrl: raw.apiUrl,
    downloadUrl: raw.downloadUrl ?? null,
  };
  return ctx.session;
};

// A JMAP error or a refused change is an error here, never a success.
const checkJmap = (raw) => {
  for (const [name, args] of raw?.methodResponses ?? []) {
    if (name === 'error') {
      throw coded(
        `jmap ${args?.type ?? 'error'}: ${args?.description ?? ''}`.trim(),
        'jmap-error'
      );
    }
    for (const field of ['notCreated', 'notUpdated', 'notDestroyed']) {
      const first = Object.values(args?.[field] ?? {})[0];
      if (first) {
        throw coded(
          `jmap ${name} refused: ${first.type ?? 'error'} ${first.description ?? ''}`.trim(),
          'jmap-refused'
        );
      }
    }
  }
  return raw;
};

const jmapEmailCall = async (ctx, session, methodCalls, options = {}) => {
  requireFetch(ctx.fetchImpl, 'jmap');
  const run = options.send ? sendCall : call;
  return checkJmap(
    await run(ctx.fetchImpl, session.apiUrl, {
      method: 'POST',
      headers: {
        ...authHeaders(tokenFor('jmap', options.token, ctx.token)),
        Accept: 'application/json',
      },
      body: { using: JMAP_USING, methodCalls },
    })
  );
};

const JMAP_PROPERTIES = [
  'id',
  'threadId',
  'messageId',
  'inReplyTo',
  'references',
  'from',
  'to',
  'cc',
  'bcc',
  'subject',
  'receivedAt',
  'sentAt',
  'preview',
  'keywords',
  'mailboxIds',
  'attachments',
  'textBody',
  'htmlBody',
  'bodyValues',
];

const jmapGet = (account, ids) => [
  'Email/get',
  {
    accountId: account,
    ...(Array.isArray(ids)
      ? { ids }
      : { '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' } }),
    properties: JMAP_PROPERTIES,
    fetchTextBodyValues: true,
    fetchHTMLBodyValues: true,
  },
  'g',
];

const jmapQuery = (account, options) => [
  'Email/query',
  {
    accountId: account,
    limit: options.limit ?? 20,
    position: options.offset ?? 0,
    filter: options.mailboxId ? { inMailbox: options.mailboxId } : undefined,
    sort: [{ property: 'receivedAt', isAscending: false }],
  },
  'q',
];

const responseOf = (raw, name) =>
  raw.methodResponses?.find(([n]) => n === name)?.[1];

const pullJmapEmail = async (ctx, options = {}) => {
  const session = await jmapSession(ctx, options);
  const account = session.accountId;
  let raw;
  if (options.sync?.has) {
    // Ask for the ids first, then only for the mails not stored yet.
    const ids =
      responseOf(
        await jmapEmailCall(
          ctx,
          session,
          [jmapQuery(account, options)],
          options
        ),
        'Email/query'
      )?.ids ?? [];
    const fresh = [];
    for (const id of ids) {
      if (!(await isKnown(options, id))) {
        fresh.push(id);
      }
    }
    raw = fresh.length
      ? await jmapEmailCall(ctx, session, [jmapGet(account, fresh)], options)
      : { methodResponses: [] };
  } else {
    raw = await jmapEmailCall(
      ctx,
      session,
      [jmapQuery(account, options), jmapGet(account)],
      options
    );
  }
  const links = (responseOf(raw, 'Email/get')?.list ?? []).map(
    normalizeJmapMessage
  );
  return { links, rawCount: links.length, nextOffset: null, raw };
};

// The account's mailboxes by role and its identities (not literal names).
const jmapBoxes = async (ctx, session, options) => {
  if (ctx.boxes) {
    return ctx.boxes;
  }
  const raw = await jmapEmailCall(
    ctx,
    session,
    [
      [
        'Mailbox/get',
        { accountId: session.accountId, properties: ['id', 'role'] },
        'm',
      ],
      ['Identity/get', { accountId: session.accountId }, 'i'],
    ],
    options
  );
  const role = (name) =>
    responseOf(raw, 'Mailbox/get')?.list?.find((b) => b.role === name)?.id ??
    null;
  ctx.boxes = {
    drafts: role('drafts'),
    sent: role('sent'),
    trash: role('trash'),
    identities: responseOf(raw, 'Identity/get')?.list ?? [],
  };
  return ctx.boxes;
};

const jmapAttachment = async (ctx, link, attachment, options) => {
  const session = await jmapSession(ctx, options);
  if (!session.downloadUrl) {
    throw coded('jmap session has no download address', 'unsupported-action');
  }
  const url = session.downloadUrl
    .replace('{accountId}', encodeURIComponent(session.accountId))
    .replace('{blobId}', encodeURIComponent(attachment.remote.blobId))
    .replace('{name}', encodeURIComponent(attachment.name))
    .replace(
      '{type}',
      encodeURIComponent(attachment.mime ?? 'application/octet-stream')
    );
  const res = await ctx.fetchImpl(url, {
    headers: authHeaders(tokenFor('jmap', options.token, ctx.token)),
  });
  if (!res.ok) {
    throw coded(
      `HTTP ${res.status} downloading the attachment`,
      'download-failed'
    );
  }
  return new Uint8Array(await res.arrayBuffer());
};

// ---- Pull through a local transport -------------------------------------------

const syncKeyOf = (ctx, options) =>
  [
    ctx.protocol,
    `${options.username ?? options.user ?? ''}@${options.host ?? ''}`,
    options.mailbox ?? 'INBOX',
  ].join(':');

const pullEmailViaTransport = async (ctx, options = {}) => {
  if (!ctx.transport?.pullMessages) {
    throw localServerRequired(ctx.protocol, 'pull');
  }
  const key = syncKeyOf(ctx, options);
  const since = (await options.sync?.get?.(key)) ?? null;
  const result = await ctx.transport.pullMessages({
    ...options,
    since,
    protocol: ctx.protocol,
    provider: ctx.provider,
  });
  const links =
    result.links ??
    (result.records ?? result.messages ?? []).map(normalizeEmailRecord);
  return {
    ...result,
    links,
    rawCount: result.rawCount ?? links.length,
    nextOffset: result.nextOffset ?? null,
    // Written once the mails are stored: a failed store pulls them again.
    afterStore:
      result.state && options.sync
        ? () => options.sync.set(key, result.state)
        : undefined,
  };
};

// ---- Sending ----------------------------------------------------------------

// The thread the chat is: who to answer, its ids and subject.
const withThread = async (content, options) => {
  const thread =
    content.chat && options.lookup?.thread
      ? await options.lookup.thread(content.chat, options)
      : null;
  if (!thread) {
    return content;
  }
  const explicit = normalizeAddress(content.to).filter((a) =>
    /^[^\s<>@]+@[^\s<>@]+$/.test(a.address)
  );
  const subject =
    content.subject ??
    (thread.subject ? `Re: ${baseSubject(thread.subject)}` : undefined);
  return {
    ...content,
    to: explicit.length > 0 ? explicit : thread.to,
    subject,
    inReplyTo: content.inReplyTo ?? thread.messageId ?? undefined,
    references:
      content.references ??
      [...(thread.references ?? []), thread.messageId].filter(Boolean),
    threadId: content.threadId ?? thread.threadId,
    replyToProviderId: explicit.length > 0 ? null : thread.providerId,
  };
};

const requireRecipient = (content) => {
  if (normalizeAddress(content.to).length === 0) {
    throw coded(
      'no recipient: the chat has no incoming mail to answer; give an address',
      'no-recipient',
      { fallback: false }
    );
  }
  return content;
};

const postGmailEmail = async (ctx, content, options = {}) => {
  requireFetch(ctx.fetchImpl, 'gmail');
  const root = rootUrl(ctx.baseUrl, 'https://gmail.googleapis.com');
  const user = options.userId ?? ctx.userId;
  const message = composeMessage(content, { now: options.now });
  const sent = await sendCall(
    ctx.fetchImpl,
    `${root}/gmail/v1/users/${user}/messages/send`,
    {
      method: 'POST',
      headers: authHeaders(tokenFor('gmail', options.token, ctx.token)),
      body: {
        raw: utf8ToBase64Url(message.raw),
        ...(content.threadId ? { threadId: content.threadId } : {}),
      },
    }
  );
  return { ...sent, messageId: message.messageId };
};

const graphRecipients = (value) =>
  normalizeAddress(value).map((entry) => ({
    emailAddress: {
      ...(entry.name ? { name: entry.name } : {}),
      address: entry.address,
    },
  }));

const graphMessage = (content) => ({
  message: {
    subject: content.subject ?? '',
    body: {
      contentType: content.html ? 'HTML' : 'Text',
      content: content.html ?? content.text ?? content.body ?? '',
    },
    toRecipients: graphRecipients(content.to),
    ...(content.cc ? { ccRecipients: graphRecipients(content.cc) } : {}),
    ...(content.bcc ? { bccRecipients: graphRecipients(content.bcc) } : {}),
  },
  saveToSentItems: content.saveToSentItems ?? true,
});

const postGraphEmail = async (ctx, content, options = {}) => {
  requireFetch(ctx.fetchImpl, 'microsoft-graph');
  const root = rootUrl(ctx.baseUrl, 'https://graph.microsoft.com/v1.0');
  const headers = authHeaders(
    tokenFor('microsoft-graph', options.token, ctx.token)
  );
  // An answer to a mail is Graph's own reply: it stays in the conversation.
  if (content.replyToProviderId && !content.html) {
    return sendCall(
      ctx.fetchImpl,
      `${root}/me/messages/${content.replyToProviderId}/reply`,
      {
        method: 'POST',
        headers,
        body: { comment: content.text ?? content.body ?? '' },
      }
    );
  }
  return sendCall(ctx.fetchImpl, `${root}/me/sendMail`, {
    method: 'POST',
    headers,
    body: graphMessage(content),
  });
};

const identityFor = (boxes, content, options) => {
  const explicit = options.identityId ?? content.identityId;
  if (explicit) {
    return explicit;
  }
  const from = normalizeAddress(content.from)[0]?.address?.toLowerCase();
  const match = boxes.identities.find((i) => i.email?.toLowerCase() === from);
  return (match ?? boxes.identities[0])?.id ?? null;
};

const jmapDraft = (content, draftsId) => ({
  mailboxIds: content.mailboxIds ?? { [draftsId]: true },
  keywords: { $draft: true },
  from: normalizeAddress(content.from),
  to: normalizeAddress(content.to),
  cc: normalizeAddress(content.cc),
  bcc: normalizeAddress(content.bcc),
  subject: content.subject ?? '',
  ...(content.inReplyTo ? { inReplyTo: [content.inReplyTo] } : {}),
  ...(content.references?.length ? { references: content.references } : {}),
  textBody: [{ partId: 'text', type: 'text/plain' }],
  bodyValues: {
    text: { value: content.text ?? content.body ?? '' },
  },
});

const postJmapEmail = async (ctx, content, options = {}) => {
  const session = await jmapSession(ctx, options);
  const boxes = await jmapBoxes(ctx, session, options);
  const draftsId = options.draftsMailboxId ?? boxes.drafts;
  const identityId = identityFor(boxes, content, options);
  if (!draftsId || !identityId) {
    throw coded(
      `jmap account has no ${draftsId ? 'identity' : 'drafts mailbox'} to send from`,
      'not-configured',
      { fallback: false }
    );
  }
  const sentId = options.sentMailboxId ?? boxes.sent;
  const raw = await jmapEmailCall(
    ctx,
    session,
    [
      [
        'Email/set',
        {
          accountId: session.accountId,
          create: { draft: jmapDraft(content, draftsId) },
        },
        'd',
      ],
      [
        'EmailSubmission/set',
        {
          accountId: session.accountId,
          create: { send: { emailId: '#draft', identityId } },
          // Sent: out of Drafts, into Sent, no longer a draft.
          onSuccessUpdateEmail: {
            '#send': {
              'keywords/$draft': null,
              [`mailboxIds/${draftsId}`]: null,
              ...(sentId ? { [`mailboxIds/${sentId}`]: true } : {}),
            },
          },
        },
        's',
      ],
    ],
    { ...options, send: true }
  );
  return raw;
};

const postEmailViaTransport = async (ctx, content, options = {}) => {
  if (!ctx.transport?.post) {
    throw localServerRequired(ctx.protocol, 'send');
  }
  return ctx.transport.post(content, {
    ...options,
    protocol: ctx.protocol,
    provider: ctx.provider,
  });
};

// ---- Mark read and delete ---------------------------------------------------

const markReadGmail = async (ctx, id, options = {}) => {
  requireFetch(ctx.fetchImpl, 'gmail');
  const root = rootUrl(ctx.baseUrl, 'https://gmail.googleapis.com');
  const user = options.userId ?? ctx.userId;
  return call(
    ctx.fetchImpl,
    `${root}/gmail/v1/users/${user}/messages/${id}/modify`,
    {
      method: 'POST',
      headers: authHeaders(tokenFor('gmail', options.token, ctx.token)),
      body: { removeLabelIds: ['UNREAD'] },
    }
  );
};

const markReadGraph = async (ctx, id, options = {}) => {
  requireFetch(ctx.fetchImpl, 'microsoft-graph');
  const root = rootUrl(ctx.baseUrl, 'https://graph.microsoft.com/v1.0');
  return call(ctx.fetchImpl, `${root}/me/messages/${id}`, {
    method: 'PATCH',
    headers: authHeaders(tokenFor('microsoft-graph', options.token, ctx.token)),
    body: { isRead: true },
  });
};

const markReadJmap = async (ctx, ids, options = {}) => {
  const session = await jmapSession(ctx, options);
  return jmapEmailCall(
    ctx,
    session,
    [
      [
        'Email/set',
        {
          accountId: session.accountId,
          update: Object.fromEntries(
            ids.map((id) => [id, { 'keywords/$seen': true }])
          ),
        },
        'r',
      ],
    ],
    options
  );
};

const deleteGmail = async (ctx, ids, options = {}) => {
  requireFetch(ctx.fetchImpl, 'gmail');
  const root = rootUrl(ctx.baseUrl, 'https://gmail.googleapis.com');
  const user = options.userId ?? ctx.userId;
  const auth = authHeaders(tokenFor('gmail', options.token, ctx.token));
  const results = [];
  for (const id of ids ?? []) {
    results.push(
      await call(
        ctx.fetchImpl,
        `${root}/gmail/v1/users/${user}/messages/${id}/trash`,
        { method: 'POST', headers: auth }
      )
    );
  }
  return { ok: true, deleted: results.length };
};

const deleteGraph = async (ctx, ids, options = {}) => {
  requireFetch(ctx.fetchImpl, 'microsoft-graph');
  const root = rootUrl(ctx.baseUrl, 'https://graph.microsoft.com/v1.0');
  const auth = authHeaders(
    tokenFor('microsoft-graph', options.token, ctx.token)
  );
  const results = [];
  for (const id of ids ?? []) {
    results.push(
      await call(ctx.fetchImpl, `${root}/me/messages/${id}/move`, {
        method: 'POST',
        headers: auth,
        body: { destinationId: 'deleteditems' },
      })
    );
  }
  return { ok: true, deleted: results.length };
};

const deleteJmap = async (ctx, ids, options = {}) => {
  const session = await jmapSession(ctx, options);
  const trash =
    options.trashMailboxId ?? (await jmapBoxes(ctx, session, options)).trash;
  if (!trash) {
    throw coded('jmap account has no trash mailbox', 'not-configured');
  }
  const update = Object.fromEntries(
    (ids ?? []).map((id) => [id, { mailboxIds: { [trash]: true } }])
  );
  await jmapEmailCall(
    ctx,
    session,
    [['Email/set', { accountId: session.accountId, update }, 'd']],
    options
  );
  return { ok: true, deleted: ids?.length ?? 0 };
};

// ---- The live object --------------------------------------------------------

const EMAIL_PULLERS = {
  gmail: pullGmailEmail,
  'microsoft-graph': pullGraphEmail,
  jmap: pullJmapEmail,
};

const EMAIL_POSTERS = {
  gmail: postGmailEmail,
  'microsoft-graph': postGraphEmail,
  jmap: postJmapEmail,
};

const ATTACHMENT_FETCHERS = {
  gmail: gmailAttachment,
  'microsoft-graph': graphAttachment,
  jmap: jmapAttachment,
};

// The provider's own id of a message: what its link recorded, else the id given.
const providerId = (link, id) => String(link?.raw?.id ?? id);

const tailOf = (link) => String(link.id).split(':').pop();

const idsOf = ({ id, ids, link, links } = {}) => {
  const all = links ?? (link ? [link] : []);
  if (all.length > 0) {
    return all.map((l) => providerId(l, tailOf(l)));
  }
  return (ids ?? (id ? [id] : [])).map(String);
};

const viaTransport = (ctx, method, params, options) => {
  if (!ctx.transport?.[method]) {
    throw localServerRequired(ctx.protocol, method);
  }
  return ctx.transport[method](params, {
    ...options,
    protocol: ctx.protocol,
    provider: ctx.provider,
  });
};

const markReadOne = {
  gmail: (ctx, ids, options) =>
    Promise.all(ids.map((id) => markReadGmail(ctx, id, options))),
  'microsoft-graph': (ctx, ids, options) =>
    Promise.all(ids.map((id) => markReadGraph(ctx, id, options))),
  jmap: (ctx, ids, options) => markReadJmap(ctx, ids, options),
};

const deleters = {
  gmail: deleteGmail,
  'microsoft-graph': deleteGraph,
  jmap: deleteJmap,
};

export const createEmailLive = (config = {}) => {
  const ctx = createEmailContext(config);
  return {
    pullMessages: async (options = {}) =>
      (EMAIL_PULLERS[ctx.protocol] ?? pullEmailViaTransport)(ctx, options),
    post: async (content, options = {}) => {
      const prepared = requireRecipient(await withThread(content, options));
      if (EMAIL_POSTERS[ctx.protocol]) {
        return EMAIL_POSTERS[ctx.protocol](ctx, prepared, options);
      }
      return postEmailViaTransport(ctx, prepared, options);
    },
    markRead: async (params = {}, options = {}) => {
      const ids = idsOf(params);
      if (markReadOne[ctx.protocol]) {
        await markReadOne[ctx.protocol](ctx, ids, options);
        return { ok: true, read: ids.length };
      }
      return viaTransport(ctx, 'markRead', { ...params, ids }, options);
    },
    deleteMessages: async (params = {}, options = {}) => {
      const ids = idsOf(params);
      if (deleters[ctx.protocol]) {
        return deleters[ctx.protocol](ctx, ids, options);
      }
      return viaTransport(ctx, 'deleteMessages', { ...params, ids }, options);
    },
    // The bytes of one attachment, from the provider that holds them.
    fetchAttachment: async ({ link, attachment }, options = {}) => {
      const fetcher = ATTACHMENT_FETCHERS[ctx.protocol];
      if (!fetcher || !attachment?.remote) {
        throw coded('this attachment cannot be fetched', 'unsupported-action');
      }
      return fetcher(ctx, link, attachment, options);
    },
  };
};

// ---- What the app calls: the saved connection, then the protocol -----------

let transportFactory = null;

/** The local-server module registers how raw mail sockets are opened. */
export const setEmailTransportFactory = (factory) => {
  transportFactory = typeof factory === 'function' ? factory : null;
};

/**
 * The protocol a set of saved options describes: the one named, else
 * IMAP/SMTP when there is a host or login, JMAP with a server address or
 * account id, else Gmail for a bare token.
 */
export const protocolFor = (options = {}, sending = false) => {
  const named = String(options.protocol ?? '').toLowerCase();
  const raw = options.host || options.username || options.user;
  let protocol = named;
  if (!protocol) {
    if (raw) {
      protocol = 'imap';
    } else if (options.accountId || options.baseUrl) {
      protocol = 'jmap';
    } else if (options.token) {
      protocol = 'gmail';
    } else {
      protocol = 'jmap';
    }
  }
  // Mail goes out over SMTP whatever the pull protocol is.
  return sending && (protocol === 'imap' || protocol === 'pop3')
    ? 'smtp'
    : protocol;
};

// The SMTP server of a mailbox given as its IMAP/POP3 host.
const smtpHostOf = (host) =>
  host ? String(host).replace(/^(?:imap|pop3?|mail)\./i, 'smtp.') : host;

const withTransport = (config) =>
  config.transport || !RAW_PROTOCOLS.has(config.protocol) || !transportFactory
    ? config
    : { ...config, transport: transportFactory(config) };

// Mail is sent over SMTP whatever protocol it is read with, and the
// mailbox's host, port and security are not SMTP's: its own are used.
const forSending = (options) => {
  if (protocolFor(options, true) !== 'smtp' || options.protocol === 'smtp') {
    return options;
  }
  return {
    ...options,
    protocol: 'smtp',
    host: options.smtpHost ?? smtpHostOf(options.host),
    port: options.smtpPort,
    security: options.smtpSecurity,
    secure: options.smtpSecure,
  };
};

const liveFor = (options, sending) => {
  const protocol = protocolFor(options, sending);
  return createEmailLive(
    withTransport({
      ...options,
      protocol,
      provider: options.provider ?? protocol,
    })
  );
};

// The mails an action is for: the ones named, else the chat's incoming ones.
const withTargets = async (params, options) => {
  if (params.link || params.links?.length || params.ids?.length || params.id) {
    return params;
  }
  const all =
    params.chat && options.lookup?.messages
      ? await options.lookup.messages(params.chat)
      : [];
  return { ...params, links: all.filter((l) => !l.outgoing).slice(-25) };
};

export const emailLiveActions = {
  live: {
    pullMessages: (options = {}) =>
      liveFor(options, false).pullMessages(options),
    post: (content, options = {}) => {
      const sending = forSending(options);
      return liveFor(sending, true).post(content, sending);
    },
    markRead: async (params = {}, options = {}) =>
      liveFor(options, false).markRead(
        await withTargets(params, options),
        options
      ),
    deleteMessages: (params = {}, options = {}) =>
      liveFor(options, false).deleteMessages(params, options),
    fetchAttachment: (params, options = {}) =>
      liveFor(options, false).fetchAttachment(params, options),
  },
};
