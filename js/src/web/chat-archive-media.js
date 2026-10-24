// Attachments of imported archive messages (R-Z15): Facebook/Messenger,
// Instagram, X, LinkedIn and WhatsApp exports. The importers copy each
// file to `media/<network>/<sha256>.<ext>` and store `{kind, name, path,
// sha256, size}` on the message; the server shows it at
// /api/media/<network>/<file> (../server/routes-media.js). Pictures are
// drawn inline, audio and video get a player, other files are chips with
// name and size; a file that was not imported (the archive did not hold
// it, or WhatsApp omitted it) is a "media not imported" chip, never a
// broken picture.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { mediaSrc } from './media-src.js';
import { formatSize } from './download/model.js';

const el = React.createElement;

// The address the page loads the file from (the app's server).
const useMediaUrl = (api, path) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    if (!path) {
      return undefined;
    }
    const wanted =
      typeof api?.archiveMediaUrl === 'function'
        ? api.archiveMediaUrl(path)
        : Promise.resolve(path);
    wanted.then((got) => live && setUrl(got ?? null)).catch(() => {});
    return () => {
      live = false;
    };
  }, [api, path]);
  return url;
};

const Missing = ({ item }) => {
  const t = useT();
  return el(
    'span',
    {
      className: 'remote-chip is-missing',
      'data-archive-missing': item.kind,
      title: t('chat.archive.notImportedShort'),
    },
    t('chat.archive.notImported', { name: item.name ?? t('chat.remote.file') })
  );
};

const FileChip = ({ item, url }) => {
  const t = useT();
  const label = [item.name ?? t('chat.remote.file'), formatSize(item.size)]
    .filter(Boolean)
    .join(' · ');
  return el(
    'a',
    {
      className: 'remote-chip',
      'data-archive-file': item.kind,
      href: url,
      download: item.name ?? '',
      title: t('chat.archive.save', { name: item.name ?? '' }),
    },
    `📎 ${label}`
  );
};

const PICTURES = new Set(['photo', 'gif', 'sticker']);

const Stored = ({ item, url }) => {
  const [broken, setBroken] = useState(false);
  if (!url) {
    return null;
  }
  const label = item.name ?? item.kind;
  if (PICTURES.has(item.kind) && !broken) {
    return el(
      'a',
      { href: url, target: '_blank', rel: 'noopener noreferrer', title: label },
      el('img', {
        ...mediaSrc(url),
        className: `remote-img remote-${item.kind}`,
        alt: label,
        loading: 'lazy',
        decoding: 'async',
        'data-archive-image': '',
        onError: () => setBroken(true),
      })
    );
  }
  if (item.kind === 'video' && !broken) {
    return el('video', {
      ...mediaSrc(url),
      className: 'remote-img',
      controls: true,
      preload: 'metadata',
      'data-archive-video': '',
      onError: () => setBroken(true),
    });
  }
  if ((item.kind === 'audio' || item.kind === 'voice') && !broken) {
    return el('audio', {
      ...mediaSrc(url),
      controls: true,
      preload: 'none',
      'data-archive-audio': '',
      onError: () => setBroken(true),
    });
  }
  return el(FileChip, { item, url });
};

const Item = ({ item, api }) => {
  const url = useMediaUrl(api, item.path);
  if (item.kind === 'link' && item.url) {
    return el(
      'a',
      {
        className: 'remote-chip',
        href: item.url,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      item.caption || item.url
    );
  }
  if (item.omitted || !item.path) {
    return el(Missing, { item });
  }
  return el(Stored, { item, url });
};

/** All the attachments of one imported message, in order. */
export const ArchiveAttachments = ({ media, api }) =>
  el(
    'div',
    {
      className: 'remote-media archive-media',
      'data-archive-media': String(media.items.length),
    },
    media.items.map((item, index) => el(Item, { key: index, item, api }))
  );
