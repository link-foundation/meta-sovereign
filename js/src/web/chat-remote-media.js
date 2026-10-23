// A message's attachments that live at another network's address (R-Z8):
// every picture, sticker and file of a VK message, not only the first.
//
// Pictures are drawn from the https address the network gave (VK's picture
// CDNs are the only hosts the page's CSP `img-src` allows besides vk.com); a
// picture that cannot load falls back to a link chip. Voice messages, files,
// videos and other things are chips that open in a new tab: the page's CSP
// has no `media-src`, so audio and video are not played inline.

import React, { useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

const https = (url) => (/^https:\/\//.test(url ?? '') ? url : null);

const CHIP_LABELS = {
  voice: 'chat.remote.voice',
  audio: 'chat.remote.audio',
  video: 'chat.remote.video',
  file: 'chat.remote.file',
  photo: 'chat.remote.photo',
  gif: 'chat.remote.photo',
  sticker: 'chat.remote.sticker',
};

const seconds = (n) =>
  Number.isFinite(Number(n)) && Number(n) > 0
    ? ` ${Math.floor(Number(n) / 60)}:${String(Math.round(Number(n) % 60)).padStart(2, '0')}`
    : '';

const labelOf = (t, item) => {
  const known = CHIP_LABELS[item.kind];
  const base = item.label ?? item.name ?? item.title;
  const word = known
    ? t(known)
    : t('chat.remote.other', { title: base ?? item.kind });
  return `${base && known ? base : word}${seconds(item.duration)}`;
};

const Chip = ({ item }) => {
  const t = useT();
  const label = labelOf(t, item);
  const href = https(item.url);
  const props = {
    className: 'remote-chip',
    'data-remote-kind': item.kind,
    title: label,
  };
  return href
    ? el(
        'a',
        { ...props, href, target: '_blank', rel: 'noopener noreferrer' },
        label
      )
    : el('span', props, label);
};

const Picture = ({ item, src }) => {
  const t = useT();
  const [broken, setBroken] = useState(false);
  if (broken) {
    return el(Chip, { item });
  }
  const label = item.name ?? t(CHIP_LABELS[item.kind] ?? 'chat.remote.photo');
  const image = el('img', {
    className: `remote-img remote-${item.kind}`,
    src,
    alt: label,
    loading: 'lazy',
    decoding: 'async',
    referrerPolicy: 'no-referrer',
    onError: () => setBroken(true),
    'data-remote-kind': item.kind,
  });
  const href = https(item.url);
  return item.kind === 'sticker' || !href
    ? image
    : el(
        'a',
        { href, target: '_blank', rel: 'noopener noreferrer', title: label },
        image
      );
};

const Item = ({ item }) => {
  const picture =
    ['photo', 'sticker', 'gif'].includes(item.kind) && https(item.url);
  if (picture) {
    return el(Picture, { item, src: picture });
  }
  // A video: its still picture when it came with one.
  if (item.kind === 'video' && https(item.thumb)) {
    return el(Picture, {
      item: { ...item, url: item.url ?? null },
      src: https(item.thumb),
    });
  }
  return el(Chip, { item });
};

/** All the attachments of one message, in order. */
export const RemoteAttachments = ({ media }) =>
  el(
    'div',
    {
      className: 'remote-media',
      'data-remote-media': String(media.items.length),
    },
    media.items.map((item, index) => el(Item, { key: index, item }))
  );
