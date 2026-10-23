// Fakes the export tests share (R-Y186): GramJS-like messages of a chat
// with Alice, a client serving them oldest-first pages as Telegram does for
// a negative add_offset and writing the files it is asked to download.

import { promises as fs } from 'node:fs';
import { named } from './telegram-route.js';

const GramHistory = named('GetHistory');
export const Api = {
  messages: { GetHistory: GramHistory },
  InputPhotoFileLocation: named('InputPhotoFileLocation'),
  InputDocumentFileLocation: named('InputDocumentFileLocation'),
};
export const helpers = { returnBigInt: (v) => BigInt(v) };

export const localDate = (day, hour = 12) =>
  new Date(2026, 0, day, hour, 0, 0).getTime() / 1000;

export const doc = (id, mimeType, attributes, size = 100) => ({
  className: 'MessageMediaDocument',
  document: {
    id: String(id),
    accessHash: '5',
    fileReference: { bytes: '' },
    dcId: 2,
    size,
    mimeType,
    attributes,
  },
});

export const photo = {
  className: 'MessageMediaPhoto',
  photo: {
    id: '11',
    accessHash: '5',
    fileReference: { bytes: '' },
    dcId: 2,
    sizes: [
      { className: 'PhotoSize', type: 'm', w: 320, h: 240, size: 100 },
      { className: 'PhotoSize', type: 'y', w: 800, h: 600, size: 900 },
    ],
  },
};

export const OTHER = { className: 'PeerUser', userId: '7' };
export const msg = (id, day, extra = {}) => ({
  className: 'Message',
  id,
  date: localDate(day),
  message: '',
  fromId: OTHER,
  peerId: { className: 'PeerUser', userId: '7' },
  ...extra,
});

export const FIXTURE = [
  msg(1, 1, { message: 'Hello <b>world</b>' }),
  msg(2, 2, {
    message: 'bold caption',
    entities: [{ className: 'MessageEntityBold', offset: 0, length: 4 }],
    media: photo,
    replyTo: { replyToMsgId: 1 },
  }),
  msg(3, 3, {
    media: doc(21, 'audio/ogg', [
      { className: 'DocumentAttributeAudio', voice: true, duration: 7 },
    ]),
  }),
  msg(4, 4, {
    media: doc(
      22,
      'video/mp4',
      [{ className: 'DocumentAttributeVideo', duration: 12, w: 640, h: 360 }],
      3 * 1024 * 1024
    ),
  }),
  msg(5, 5, {
    media: doc(23, 'image/webp', [
      { className: 'DocumentAttributeSticker', alt: '\u{1F600}' },
    ]),
  }),
  msg(6, 6, {
    media: doc(24, 'application/pdf', [
      { className: 'DocumentAttributeFilename', fileName: 'report.pdf' },
    ]),
  }),
  msg(7, 7, {
    media: doc(25, 'video/mp4', [
      {
        className: 'DocumentAttributeVideo',
        duration: 3,
        w: 240,
        h: 240,
        roundMessage: true,
      },
    ]),
  }),
  msg(8, 8, {
    media: doc(26, 'video/mp4', [
      { className: 'DocumentAttributeAnimated' },
      { className: 'DocumentAttributeVideo', duration: 2, w: 100, h: 100 },
    ]),
  }),
  {
    className: 'MessageService',
    id: 9,
    date: localDate(9),
    fromId: OTHER,
    peerId: OTHER,
    action: { className: 'MessageActionChatAddUser', users: ['7'] },
  },
  msg(10, 10, {
    message: 'forwarded',
    fwdFrom: { fromName: 'Somebody' },
    out: true,
    fromId: undefined,
  }),
];

export const USERS = [
  { className: 'User', id: '7', firstName: 'Alice', lastName: 'Liddell' },
  { className: 'User', id: '1', firstName: 'Me', self: true },
];

// A client serving `messages` oldest-first pages as Telegram does for a
// negative add_offset, and writing the files it is asked to download.
export const fakeClient = (messages, hooks = {}) => {
  const log = { history: [], downloads: [] };
  const client = {
    invoke: async (request) => {
      log.history.push(request);
      await hooks.onHistory?.(request, log);
      const all = [...messages].sort((a, b) => a.id - b.id);
      const list = request.offsetId
        ? all.filter((m) => m.id >= request.offsetId)
        : all.filter((m) => m.date >= request.offsetDate);
      return {
        className: 'messages.MessagesSlice',
        messages: list.slice(0, request.limit).reverse(),
        users: USERS,
        chats: [],
        count: all.length,
      };
    },
    downloadFile: async (location, options) => {
      log.downloads.push({ location, options });
      await hooks.onDownload?.(location, options, log);
      await fs.writeFile(
        options.outputFile,
        Buffer.alloc(Math.min(Number(options.fileSize), 64), 1)
      );
    },
  };
  return { client, log };
};
