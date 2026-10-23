/**
 * What an exported message carries besides its words (R-Y186; Telegram
 * Desktop's export, learned, never copied): which kind of file it is,
 * which of the export's folders it goes to, whether the user's choices
 * (kinds on or off, the size limit) let it be downloaded, and the JSON
 * fields that name the file or tell why there is none. Places, contacts
 * and polls need no file: they are written into the message itself.
 */

import path from 'node:path';
import { docKind, mediaOf } from './telegram-media.js';
import { safeName, stampOf } from './telegram-export-paths.js';

export const OPTION_OF = Object.freeze({
  photo: 'photos',
  video: 'videos',
  round: 'roundVideo',
  voice: 'voice',
  sticker: 'stickers',
  gif: 'gifs',
  audio: 'files',
  file: 'files',
});

export const FOLDER_OF = Object.freeze({
  photo: 'photos',
  video: 'video_files',
  gif: 'video_files',
  round: 'round_video_messages',
  voice: 'voice_messages',
  sticker: 'stickers',
  audio: 'files',
  file: 'files',
});

// The size limit applies to videos and files, as in Desktop.
const LIMITED = new Set(['video', 'gif', 'audio', 'file']);

const MEDIA_TYPE = Object.freeze({
  video: 'video_file',
  gif: 'animation',
  round: 'video_message',
  voice: 'voice_message',
  sticker: 'sticker',
  audio: 'audio_file',
});

const BASE = Object.freeze({
  photo: 'photo',
  video: 'video',
  gif: 'animation',
  round: 'video',
  voice: 'audio',
  sticker: 'sticker',
  audio: 'audio',
  file: 'file',
});

export const NOTE_TOO_LARGE =
  '(File exceeds maximum size. Change data exporting settings to download.)';
export const NOTE_OFF =
  '(File not included. Change data exporting settings to download.)';
export const NOTE_FAILED = '(File unavailable, please try again later.)';

const MIME_EXT = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/x-tgsticker': 'tgs',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'text/plain': 'txt',
});

const SIZE_ORDER = ['w', 'y', 'x', 'm', 's'];

const sizeOf = (s) =>
  Array.isArray(s?.sizes) ? Math.max(0, ...s.sizes) : Number(s?.size ?? 0);

// The biggest real size of a photo (not the inline stripped preview).
const bestSize = (photo) => {
  const real = (photo?.sizes ?? []).filter(
    (s) =>
      s?.className === 'PhotoSize' || s?.className === 'PhotoSizeProgressive'
  );
  for (const type of SIZE_ORDER) {
    const hit = real.find((s) => s.type === type);
    if (hit) {
      return hit;
    }
  }
  return real.at(-1) ?? null;
};

const attrOf = (doc, className) =>
  (doc?.attributes ?? []).find((a) => a?.className === className);

const photoInfo = (photo) => {
  const size = bestSize(photo);
  return size && photo.id !== undefined
    ? {
        kind: 'photo',
        file: photo,
        thumb: size.type,
        size: sizeOf(size),
        ext: 'jpg',
        mime: 'image/jpeg',
        meta: { width: size.w, height: size.h },
      }
    : null;
};

const kindOfDocument = (doc) => {
  const kind = docKind(doc);
  return kind === 'video' && attrOf(doc, 'DocumentAttributeVideo')?.roundMessage
    ? 'round'
    : kind;
};

const extOf = (kind, doc, original) => {
  const named = path.extname(original ?? '').slice(1);
  return (
    named ||
    MIME_EXT[doc.mimeType] ||
    (kind === 'voice' ? 'ogg' : kind === 'round' ? 'mp4' : 'bin')
  );
};

// Sizes, length and tags a document's attributes tell.
const docMeta = (kind, doc) => {
  const video = attrOf(doc, 'DocumentAttributeVideo');
  const audio = attrOf(doc, 'DocumentAttributeAudio');
  const image = attrOf(doc, 'DocumentAttributeImageSize');
  const duration = video?.duration ?? audio?.duration;
  const tags = kind === 'audio' ? audio : null;
  return {
    media_type: MEDIA_TYPE[kind],
    mime_type: doc.mimeType,
    duration_seconds:
      duration === undefined ? undefined : Math.round(Number(duration)),
    width: video?.w ?? image?.w,
    height: video?.h ?? image?.h,
    sticker_emoji: attrOf(doc, 'DocumentAttributeSticker')?.alt,
    performer: tags?.performer,
    title: tags?.title,
  };
};

const documentInfo = (doc) => {
  const kind = kindOfDocument(doc);
  const original = attrOf(doc, 'DocumentAttributeFilename')?.fileName;
  return {
    kind,
    file: doc,
    thumb: '',
    size: Number(doc.size ?? 0),
    ext: extOf(kind, doc, original),
    mime: doc.mimeType,
    original,
    meta: docMeta(kind, doc),
  };
};

/**
 * The file a message carries: `{ kind, option, folder, limited, size,
 * ext, mime, file, thumb, meta, original? }`, or null (no file, an
 * expired or locked one).
 */
export const fileInfoOf = (raw) => {
  const media = mediaOf(raw);
  let info = null;
  if (media?.className === 'MessageMediaPhoto') {
    info = photoInfo(media.photo);
  } else if (
    media?.className === 'MessageMediaDocument' &&
    media.document?.id
  ) {
    info = documentInfo(media.document);
  }
  return info
    ? {
        ...info,
        option: OPTION_OF[info.kind],
        folder: FOLDER_OF[info.kind],
        limited: LIMITED.has(info.kind),
      }
    : null;
};

/** `null` to download, else the note that replaces the file's path. */
export const skipNote = (info, options) => {
  if (!options.media?.[info.option]) {
    return NOTE_OFF;
  }
  const limit = Number(options.sizeLimitMb) * 1024 * 1024;
  return info.limited && info.size > limit ? NOTE_TOO_LARGE : null;
};

/** The file's name inside its folder, e.g. `photo_3@23-10-2026_14-05-09.jpg`. */
export const wantedName = (info, { index, at }) =>
  info.original
    ? safeName(info.original)
    : `${BASE[info.kind]}_${index}@${stampOf(at * 1000)}.${info.ext}`;

/** The message's JSON fields for its file: the path, or the note. */
export const mediaFields = (info, target) => {
  const meta = Object.fromEntries(
    Object.entries(info.meta).filter(([, v]) => v !== undefined)
  );
  if (info.kind === 'photo') {
    return {
      photo: target,
      photo_file_size: info.size || undefined,
      ...meta,
    };
  }
  const { media_type: type, ...rest } = meta;
  return {
    file: target,
    ...(info.original ? { file_name: info.original } : {}),
    file_size: info.size || undefined,
    ...(type ? { media_type: type } : {}),
    ...rest,
  };
};

const words = (value) =>
  typeof value === 'string' ? value : String(value?.text ?? '');

const pollOf = (media) => {
  const results = media.results?.results ?? [];
  return {
    question: words(media.poll?.question),
    closed: Boolean(media.poll?.closed),
    total_voters: Number(media.results?.totalVoters ?? 0),
    answers: (media.poll?.answers ?? []).map((a) => {
      const hit = results.find((r) => r.option?.bytes === a.option?.bytes);
      return {
        text: words(a.text),
        voters: Number(hit?.voters ?? 0),
        chosen: Boolean(hit?.chosen),
      };
    }),
  };
};

/** Places, contacts and polls: written into the message, no file. */
export const inlineMediaOf = (raw) => {
  const media = raw?.media;
  switch (media?.className) {
    case 'MessageMediaGeo':
    case 'MessageMediaGeoLive':
      return {
        location_information: {
          latitude: media.geo?.lat,
          longitude: media.geo?.long,
        },
      };
    case 'MessageMediaContact':
      return {
        contact_information: {
          first_name: media.firstName ?? '',
          last_name: media.lastName ?? '',
          phone_number: media.phoneNumber ?? '',
        },
      };
    case 'MessageMediaPoll':
      return { poll: pollOf(media) };
    default:
      return {};
  }
};
