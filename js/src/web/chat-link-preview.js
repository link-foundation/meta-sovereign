// The link preview over the message box, as Telegram Desktop shows it
// (R-Y145; learned, never copied): while the text holds a link, Telegram
// is asked for its preview (about 0.6 s after the typing stops) and a bar
// above the box shows the site, title and description, one line each,
// with the page's picture when it has one. × sends the message without a
// preview; the options put the preview above the text and make its media
// larger or smaller. The picture comes only through the app's server
// (downloaded by the Telegram client); no third-party address is loaded.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { mediaSrc } from './media-src.js';

const el = React.createElement;

const DEBOUNCE_MS = 600;
const AGAIN_MS = 1500;
const TRIES = 3;

// A link: http(s)://…, or a bare domain (example.com/path) as Telegram's
// entity parser takes it; not an e-mail address and not a file name.
const LINK =
  /(?<![\w@.\-/])(?:https?:\/\/[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?::\d{1,5})?(?:[/?#][^\s<>"']*)?)/gi;
const FILE_ENDINGS = new Set([
  'txt',
  'md',
  'js',
  'mjs',
  'json',
  'py',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'pdf',
  'zip',
  'exe',
  'doc',
  'docx',
  'csv',
  'log',
  'css',
  'rs',
  'ts',
  'sh',
]);
const TRAILING = /[.,;:!?)\]}»”’]+$/;

/** The first link in `text` (as typed, without trailing punctuation). */
export const linkOf = (text) => {
  for (const match of String(text ?? '').matchAll(LINK)) {
    const link = match[0].replace(TRAILING, '');
    if (/^https?:\/\/./i.test(link)) {
      return link;
    }
    const host = link.split(/[/?#:]/)[0];
    if (!FILE_ENDINGS.has(host.split('.').at(-1).toLowerCase())) {
      return link;
    }
  }
  return null;
};

/** What a send carries about the preview; null when nothing was chosen. */
export const choiceOf = ({ link, dismissed, invert, size }) => {
  if (!link) {
    return null;
  }
  const choice = {
    ...(dismissed ? { noWebpage: true } : {}),
    ...(invert ? { invertMedia: true } : {}),
    ...(size && !dismissed ? { previewUrl: link, previewSize: size } : {}),
  };
  return Object.keys(choice).length > 0 ? choice : null;
};

const NONE = { status: 'idle', preview: null };

// Asks for the link's preview: after the pause, again while it is pending.
const useAsk = ({ api, enabled, link, text }) => {
  const [got, setGot] = useState(NONE);
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    setGot(NONE);
    if (!enabled || !link) {
      return undefined;
    }
    let live = true;
    let timer = null;
    const ask = (left) => {
      Promise.resolve(
        api.telegramLinkPreview({ text: latest.current, url: link })
      ).then(
        (answer) => {
          if (!live) {
            return;
          }
          if (answer?.ok && answer.state === 'ready') {
            setGot({ status: 'ready', preview: answer.preview });
          } else if (answer?.ok && answer.state === 'pending' && left > 0) {
            setGot({ status: 'loading', preview: null });
            timer = globalThis.setTimeout(() => ask(left - 1), AGAIN_MS);
          }
        },
        () => {}
      );
    };
    timer = globalThis.setTimeout(() => ask(TRIES), DEBOUNCE_MS);
    return () => {
      live = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, enabled, link]);
  return got;
};

const PreviewPhoto = ({ api, id }) => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    Promise.resolve(api?.telegramLinkPreviewPhotoUrl?.({ id })).then(
      (url) => live && setSrc(url ?? null),
      () => {}
    );
    return () => {
      live = false;
    };
  }, [api, id]);
  return src
    ? el('img', {
        className: 'link-preview-photo',
        alt: '',
        ...mediaSrc(src),
      })
    : null;
};

const Lines = ({ preview, loading, t }) =>
  el('span', { className: 'link-preview-body' }, [
    loading
      ? el(
          'span',
          { key: 'l', className: 'link-preview-site' },
          t('chat.linkPreview.loading')
        )
      : null,
    preview?.siteName || preview?.displayUrl
      ? el(
          'span',
          { key: 's', className: 'link-preview-site' },
          preview.siteName || preview.displayUrl
        )
      : null,
    preview?.title
      ? el('span', { key: 't', className: 'link-preview-title' }, preview.title)
      : null,
    preview?.description
      ? el(
          'span',
          { key: 'd', className: 'link-preview-text' },
          preview.description
        )
      : null,
  ]);

const OptionButton = ({ action, label, onClick }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'link-preview-option',
      'data-action': action,
      onClick,
    },
    label
  );

const Options = ({ t, preview, invert, size, set }) =>
  el('div', { className: 'link-preview-options' }, [
    el(OptionButton, {
      key: 'invert',
      action: 'link-preview-invert',
      label: t(invert ? 'chat.linkPreview.below' : 'chat.linkPreview.above'),
      onClick: () => set({ invert: !invert }),
    }),
    preview?.photo
      ? el(OptionButton, {
          key: 'size',
          action: 'link-preview-size',
          label: t(
            size === 'large'
              ? 'chat.linkPreview.smaller'
              : 'chat.linkPreview.larger'
          ),
          onClick: () => set({ size: size === 'large' ? 'small' : 'large' }),
        })
      : null,
  ]);

const Bar = ({ api, t, got, invert, size, set, onClose }) => {
  const [more, setMore] = useState(false);
  const { preview } = got;
  return el('div', { className: 'composer-link-preview', role: 'group' }, [
    el('span', {
      key: 'line',
      className: 'link-preview-line',
      'aria-hidden': 'true',
    }),
    preview?.photo
      ? el(PreviewPhoto, { key: 'p', api, id: preview.photo })
      : null,
    el(Lines, { key: 'b', preview, loading: got.status === 'loading', t }),
    preview
      ? el(
          'button',
          {
            key: 'more',
            type: 'button',
            className: 'link-preview-more',
            'data-action': 'link-preview-options',
            'aria-label': t('chat.linkPreview.options'),
            'aria-expanded': more ? 'true' : 'false',
            onClick: () => setMore(!more),
          },
          '⋯'
        )
      : null,
    el(
      'button',
      {
        key: 'x',
        type: 'button',
        className: 'composer-reply-clear',
        'data-action': 'link-preview-close',
        'aria-label': t('chat.linkPreview.close'),
        title: t('chat.linkPreview.close'),
        onClick: onClose,
      },
      el(Icon, { name: 'close', size: 16 })
    ),
    more && preview
      ? el(Options, { key: 'opts', t, preview, invert, size, set })
      : null,
  ]);
};

/**
 * The preview bar for the box's text, and what the next send carries
 * (told to the composer). `bar` is null when there is nothing to show.
 */
export const useLinkPreview = ({ api, state, text, composer }) => {
  const t = useT();
  const enabled =
    state.current?.source === 'telegram' &&
    state.telegram?.kind !== 'bot' &&
    typeof api?.telegramLinkPreview === 'function';
  const link = useMemo(() => (enabled ? linkOf(text) : null), [enabled, text]);
  const chatKey = state.current?.key ?? null;
  const got = useAsk({ api, enabled, link, text });
  const [chosen, setChosen] = useState({
    dismissed: false,
    invert: false,
    size: null,
  });
  // A new link or chat: the choices start again.
  useEffect(() => {
    setChosen({ dismissed: false, invert: false, size: null });
  }, [link, chatKey]);
  const shown = got.status !== 'idle';
  const size = chosen.size ?? (got.preview?.large ? 'large' : 'small');
  useEffect(() => {
    composer.setPreviewChoice(
      shown
        ? choiceOf({
            link,
            dismissed: chosen.dismissed,
            invert: chosen.invert,
            size: chosen.size,
          })
        : null
    );
  }, [shown, link, chosen]);
  const set = (change) => setChosen((was) => ({ ...was, ...change }));
  return {
    bar:
      shown && !chosen.dismissed
        ? el(Bar, {
            key: 'link-preview',
            api,
            t,
            got,
            invert: chosen.invert,
            size,
            set,
            onClose: () => set({ dismissed: true }),
          })
        : null,
  };
};
