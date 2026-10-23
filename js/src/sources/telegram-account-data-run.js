/**
 * The work of "Export Telegram data" (R-Y212; learned, never copied),
 * done inside a takeout session: the account's information, the contacts,
 * the chat list chosen by kind, and each chat's history written by the
 * per-chat export (R-Y186, ./telegram-export-run.js) into its own folder
 * `chats/chat_NN`. Every request goes out wrapped in invokeWithTakeout.
 * `r` is the run: `{ env, c, job, value, now, sleep, takeoutId }`; Cancel is
 * the job's `cancelling` state, looked at between steps.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { asked, execute, newRun, stopping } from './telegram-export-run.js';
import { chatMeta } from './telegram-export-output.js';
import { EXPORT_CSS, esc, pageHtml } from './telegram-export-html.js';

const PAGE = 100;
const MAX_PAGES = 500;

/** The chat kinds the user picks from. */
export const KINDS = Object.freeze([
  'personal',
  'bots',
  'privateGroups',
  'privateChannels',
  'publicChats',
]);

const KIND_OF_TYPE = {
  personal_chat: 'personal',
  saved_messages: 'personal',
  bot_chat: 'bots',
  private_group: 'privateGroups',
  private_supergroup: 'privateGroups',
  private_channel: 'privateChannels',
  public_supergroup: 'publicChats',
  public_channel: 'publicChats',
};

/** `{ contacts, messageUsers, … }` for account.initTakeoutSession. */
export const takeoutFlags = (value) => {
  const k = value.kinds;
  const flags = {
    contacts: value.contacts || undefined,
    messageUsers: k.personal || k.bots || undefined,
    messageChats: k.privateGroups || undefined,
    messageMegagroups: k.privateGroups || k.publicChats || undefined,
    messageChannels: k.privateChannels || k.publicChats || undefined,
  };
  return Object.fromEntries(
    Object.entries(flags).filter(([, v]) => v !== undefined)
  );
};

/** Seconds Telegram asks to wait (TAKEOUT_INIT_DELAY_X), or 0. */
export const delayOf = (error) => {
  const text = `${error?.errorMessage ?? ''} ${error?.message ?? ''}`;
  if (!text.includes('TAKEOUT_INIT_DELAY')) {
    return 0;
  }
  const match = /TAKEOUT_INIT_DELAY_(\d+)/.exec(text);
  return match ? Number(match[1]) : Number(error?.seconds) || 1;
};

/** The client with every request wrapped in invokeWithTakeout. */
export const takeoutClient = (c, takeoutId) =>
  new Proxy(c.client, {
    get: (target, prop) => {
      if (prop === 'invoke') {
        return (request, ...rest) =>
          target.invoke(
            new c.Api.InvokeWithTakeout({ takeoutId, query: request }),
            ...rest
          );
      }
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

const pad = (n) => String(n).padStart(2, '0');

const peerId = (peer) => {
  if (peer?.userId !== undefined) {
    return String(peer.userId);
  }
  if (peer?.chatId !== undefined) {
    return `-${peer.chatId}`;
  }
  return peer?.channelId !== undefined ? `-100${peer.channelId}` : null;
};

const userName = (u) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') ||
  u.username ||
  `user${u.id}`;

// What a dialog's peer is: `{ id, name, type }`, or null for a chat that
// cannot be read (forbidden, deleted).
const entryOf = (dialog, page) => {
  const id = peerId(dialog.peer);
  if (!id) {
    return null;
  }
  const key = id.startsWith('-100')
    ? `channel${id.slice(4)}`
    : id.startsWith('-')
      ? `chat${id.slice(1)}`
      : `user${id}`;
  let known;
  if (key.startsWith('user')) {
    const u = (page.users ?? []).find((x) => String(x.id) === id);
    known = u && {
      title: userName(u),
      bot: Boolean(u.bot),
      self: Boolean(u.self),
      username: u.username,
    };
  } else {
    const num = key.replace(/^\D+/, '');
    const c = (page.chats ?? []).find((x) => String(x.id) === num);
    known = c &&
      !String(c.className).endsWith('Forbidden') && {
        title: c.title,
        username: c.username,
        megagroup: Boolean(c.megagroup),
      };
  }
  if (!known) {
    return null;
  }
  const meta = chatMeta({
    chat: id,
    chatName: known.title,
    entities: new Map([[key, known]]),
  });
  return { id, name: meta.name, type: meta.type };
};

const topMessage = (dialog, page) =>
  (page.messages ?? []).find(
    (m) =>
      Number(m.id) === Number(dialog.topMessage) &&
      peerId(m.peerId) === peerId(dialog.peer)
  );

const unixOf = (value) =>
  typeof value === 'string'
    ? Math.floor(Date.parse(value) / 1000) || 0
    : Number(value) || 0;

const offsetPeerOf = async (r, dialog) => {
  try {
    return await r.c.client.getInputEntity(peerId(dialog.peer));
  } catch {
    return new r.c.Api.InputPeerEmpty();
  }
};

// One folder's dialogs, page by page; `into` is the id → entry map.
const readFolder = async (r, folderId, into) => {
  let cursor = { offsetDate: 0, offsetId: 0 };
  let offsetPeer = new r.c.Api.InputPeerEmpty();
  for (let n = 1; n <= MAX_PAGES && !stopping(r); n += 1) {
    const page = await asked(r, `dialogs:takeout:${folderId ?? 0}:${n}`, () =>
      r.client.invoke(
        new r.c.Api.messages.GetDialogs({
          ...(folderId === undefined ? {} : { folderId }),
          ...cursor,
          offsetPeer,
          limit: PAGE,
          hash: r.c.zero,
        })
      )
    );
    const dialogs = page.dialogs ?? [];
    for (const dialog of dialogs) {
      const entry = entryOf(dialog, page);
      if (entry && !into.has(entry.id)) {
        into.set(entry.id, entry);
      }
    }
    const last = dialogs.at(-1);
    const top = last && topMessage(last, page);
    if (
      dialogs.length < PAGE ||
      page.className === 'messages.Dialogs' ||
      !top
    ) {
      return;
    }
    cursor = { offsetDate: unixOf(top.date), offsetId: Number(top.id) };
    offsetPeer = await offsetPeerOf(r, last);
  }
};

/** The chats of the chosen kinds: main list, then the archive. */
export const listChats = async (r) => {
  const all = new Map();
  await readFolder(r, undefined, all);
  await readFolder(r, 1, all);
  return [...all.values()].filter(
    (e) => r.value.kinds[KIND_OF_TYPE[e.type]] === true
  );
};

const personalInfo = async (r) => {
  const { Api } = r.c;
  const full = await asked(r, 'users:takeout:self', () =>
    r.client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }))
  );
  const u = (full.users ?? []).find((x) => x.self) ?? full.users?.[0] ?? {};
  return {
    user_id: Number(u.id) || null,
    first_name: u.firstName ?? '',
    last_name: u.lastName ?? '',
    phone_number: u.phone ? `+${u.phone}` : '',
    username: u.username ? `@${u.username}` : '',
    bio: full.fullUser?.about ?? '',
  };
};

const contactList = async (r) => {
  const res = await asked(r, 'contacts:takeout', () =>
    r.client.invoke(new r.c.Api.contacts.GetContacts({ hash: r.c.zero }))
  );
  const ids = new Set((res.contacts ?? []).map((x) => String(x.userId)));
  return (res.users ?? [])
    .filter((u) => ids.has(String(u.id)))
    .map((u) => ({
      first_name: u.firstName ?? '',
      last_name: u.lastName ?? '',
      phone_number: u.phone ? `+${u.phone}` : '',
    }));
};

// A job for one chat: its state follows the whole export's Cancel, the
// state the per-chat run ends in is kept in `ended`.
const chatJob = (parent, entry, folder, options) => {
  const sub = {
    chat: entry.id,
    chatName: entry.name,
    options,
    folder,
    formats: parent.formats,
    messages: 0,
    total: null,
    files: 0,
    skipped: 0,
    failed: 0,
    bytes: 0,
    current: null,
    ended: null,
  };
  let end = null;
  Object.defineProperty(sub, 'state', {
    get: () => (parent.state === 'cancelling' ? 'cancelling' : 'running'),
    set: (state) => {
      end = state;
      sub.ended = state;
    },
  });
  return { sub, ended: () => end };
};

const SUMS = ['messages', 'files', 'skipped', 'failed', 'bytes'];

const exportChat = async (r, entry, index) => {
  const { job } = r;
  const folder = path.join(job.folder, 'chats', `chat_${pad(index + 1)}`);
  const base = Object.fromEntries(SUMS.map((k) => [k, job[k]]));
  const { sub, ended } = chatJob(job, entry, folder, r.value.chatOptions);
  const sync = () => {
    for (const k of SUMS) {
      job[k] = base[k] + sub[k];
    }
    job.current = sub.current;
  };
  job.chatName = entry.name;
  await execute(
    newRun({
      env: r.env,
      c: r.tc,
      job: sub,
      now: r.now,
      sleep: r.sleep,
      publish: async () => sync(),
    })
  );
  sync();
  job.current = null;
  return { ...entry, folder: `chats/chat_${pad(index + 1)}`, state: ended() };
};

const indexHtml = (title, rows) =>
  pageHtml({
    title,
    body: `<ul>\n${rows
      .map(
        (row) =>
          `<li>${row.href ? `<a href="${esc(row.href)}">${esc(row.text)}</a>` : esc(row.text)}</li>`
      )
      .join('\n')}\n</ul>\n`,
  });

const writeIndex = async (r, data) => {
  const { job } = r;
  const result = {
    about: 'Here is the data you requested. Handle with care.',
    ...(data.info ? { personal_information: data.info } : {}),
    ...(data.contacts
      ? { contacts: { about: 'Your contacts.', list: data.contacts } }
      : {}),
    chats: {
      about: 'Chats exported to the folders below.',
      list: data.chats.map((c) => ({
        name: c.name,
        type: c.type,
        id: Number(c.id.replace(/^-100|^-/, '')),
        folder: c.folder,
        exported: c.state === 'done',
      })),
    },
  };
  if (job.formats.includes('json')) {
    await fs.writeFile(
      path.join(job.folder, 'result.json'),
      `${JSON.stringify(result, null, 1)}\n`
    );
  }
  if (job.formats.includes('html')) {
    await fs.mkdir(path.join(job.folder, 'css'), { recursive: true });
    await fs.writeFile(path.join(job.folder, 'css', 'style.css'), EXPORT_CSS);
    const rows = [
      ...(data.info
        ? [
            {
              text: `${data.info.first_name} ${data.info.last_name} ${data.info.phone_number}`.trim(),
            },
          ]
        : []),
      ...(data.contacts ?? []).map((c) => ({
        text: `${c.first_name} ${c.last_name} ${c.phone_number}`.trim(),
      })),
      ...data.chats.map((c) => ({
        text: c.name,
        href: `${c.folder}/messages.html`,
      })),
    ];
    await fs.writeFile(
      path.join(job.folder, 'export_results.html'),
      indexHtml('Exported Data', rows)
    );
  }
};

const gather = async (r) => {
  const { job, value } = r;
  const data = { info: null, contacts: null, chats: [] };
  await fs.mkdir(job.folder, { recursive: true });
  job.phase = 'info';
  if (value.info && !stopping(r)) {
    data.info = await personalInfo(r);
  }
  job.phase = 'contacts';
  if (value.contacts && !stopping(r)) {
    data.contacts = await contactList(r);
  }
  job.phase = 'chats';
  const chats = stopping(r) ? [] : await listChats(r);
  job.chatsTotal = chats.length;
  for (const [i, entry] of chats.entries()) {
    if (stopping(r)) {
      break;
    }
    const done = await exportChat(r, entry, i);
    data.chats.push(done);
    job.chatsDone = i + 1;
    if (done.state === 'failed') {
      job.chatsFailed += 1;
    }
  }
  return data;
};

/** Runs the whole export; resolves to the state it ends in. */
export const runDataExport = async (r) => {
  const { job } = r;
  r.tc = { ...r.c, client: r.client };
  try {
    const data = await gather(r);
    job.phase = 'writing';
    await writeIndex(r, data);
    return stopping(r) ? 'cancelled' : 'done';
  } catch (error) {
    job.error = error;
    return stopping(r) ? 'cancelled' : 'failed';
  }
};
