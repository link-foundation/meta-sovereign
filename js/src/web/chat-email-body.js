// A mail in its bubble (R-Z5; learned, never copied): its HTML shown from
// the server's safe tree (../sources/email-html.js), never as HTML. Only
// elements this file knows are drawn; text is text; a link opens only for
// http, https, mailto and tel (the instant-view renderer's own check,
// chat-instant-view-render.js `linkOf`), in a new tab with rel=noopener; a
// remote picture was dropped by the server, so opening the mail tells the
// sender nothing; an inline picture is a part of the same mail, asked for
// by its `cid`. The attachments are listed with a download link each (the
// server answers them from its media folder).

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { linkOf } from './chat-instant-view-render.js';
import { mediaSrc } from './media-src.js';

const el = React.createElement;

// Tags drawn as the same element; any other node draws its children only.
const PLAIN = new Set([
  'p',
  'div',
  'blockquote',
  'pre',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'b',
  'i',
  'u',
  's',
  'code',
  'sub',
  'sup',
  'small',
  'thead',
  'tbody',
  'tfoot',
  'tr',
]);

const spanOf = (value) =>
  Number.isInteger(value) && value > 1 && value <= 20 ? value : undefined;

const nodeOf = (node, ctx, key) => {
  if (node.t === 'text') {
    return node.s;
  }
  if (node.t === 'br' || node.t === 'hr') {
    return el(node.t, { key });
  }
  if (node.t === 'img') {
    const src = ctx.cid(node.cid);
    return src
      ? el('img', {
          key,
          ...mediaSrc(src),
          alt: String(node.alt ?? ''),
          className: 'email-img',
          loading: 'lazy',
          referrerPolicy: 'no-referrer',
        })
      : node.alt || null;
  }
  const kids = nodesOf(node.c, ctx);
  if (node.t === 'a') {
    const href = linkOf(node.href);
    return href
      ? el(
          'a',
          {
            key,
            href,
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
            className: 'email-link',
          },
          kids
        )
      : el(React.Fragment, { key }, kids);
  }
  if (node.t === 'table') {
    return el(
      'div',
      { key, className: 'email-table' },
      el('table', null, kids)
    );
  }
  if (node.t === 'td' || node.t === 'th') {
    return el(
      node.t,
      { key, colSpan: spanOf(node.colSpan), rowSpan: spanOf(node.rowSpan) },
      kids
    );
  }
  return PLAIN.has(node.t)
    ? el(node.t, { key }, kids)
    : el(React.Fragment, { key }, kids);
};

function nodesOf(nodes, ctx) {
  return (nodes ?? []).map((node, i) => nodeOf(node, ctx, i));
}

/** The nodes of a mail's safe tree as React elements. */
export const EmailTree = ({ tree, cid }) =>
  el('div', { className: 'email-html' }, nodesOf(tree, { cid }));

const sizeText = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) {
    return '';
  }
  if (n < 1024) {
    return `${n} B`;
  }
  return n < 1024 * 1024
    ? `${Math.round(n / 1024)} KB`
    : `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// The server's address of each attachment (its download), and of each
// inline picture by cid.
const useUrls = (api, id, files) => {
  const [urls, setUrls] = useState({ down: [], cid: {} });
  const key = files.map((f) => `${f.name}|${f.cid ?? ''}`).join(',');
  useEffect(() => {
    let live = true;
    if (!files.length || typeof api?.emailAttachmentUrl !== 'function') {
      return undefined;
    }
    Promise.all(
      files.map((f, n) =>
        Promise.all([
          api.emailAttachmentUrl({ id, n }),
          f.cid && f.inline
            ? api.emailAttachmentUrl({ id, n, inline: true })
            : null,
        ]).catch(() => [null, null])
      )
    ).then((pairs) => {
      if (live) {
        setUrls({
          down: pairs.map((p) => p[0]),
          cid: Object.fromEntries(
            files.map((f, n) => [f.cid, pairs[n][1]]).filter(([c, u]) => c && u)
          ),
        });
      }
    });
    return () => {
      live = false;
    };
    // `key` stands for `files`.
  }, [api, id, key]);
  return urls;
};

/** A mail's HTML (safe tree) and its attachments. */
export const EmailBody = ({ message, api }) => {
  const t = useT();
  const files = Array.isArray(message.attachments) ? message.attachments : [];
  const urls = useUrls(api, message.id, files);
  const listed = files
    .map((f, n) => ({ f, n }))
    .filter(({ f }) => !(f.inline && f.cid && f.mime?.startsWith('image/')));
  return el('div', { className: 'email-body' }, [
    message.bodyTree
      ? el(EmailTree, {
          key: 'tree',
          tree: message.bodyTree,
          cid: (cid) => urls.cid[cid] ?? null,
        })
      : null,
    listed.length
      ? el(
          'ul',
          {
            key: 'files',
            className: 'email-files',
            'aria-label': t('email.attachments'),
          },
          listed.map(({ f, n }) =>
            el('li', { key: n, className: 'email-file' }, [
              el('span', { key: 'n', className: 'email-file-name' }, f.name),
              el(
                'span',
                { key: 's', className: 'meta' },
                [f.mime, sizeText(f.size)].filter(Boolean).join(' · ')
              ),
              urls.down[n]
                ? el(
                    'a',
                    {
                      key: 'd',
                      href: urls.down[n],
                      download: f.name,
                      className: 'email-file-download',
                      'data-download': String(n),
                    },
                    t('email.download')
                  )
                : null,
            ])
          )
        )
      : null,
  ]);
};

/** A mail's bubble part: its HTML and attachments, or nothing for other networks. */
export const emailBubble = (message, api) =>
  message.source === 'email' &&
  (message.bodyTree || message.attachments?.length)
    ? el(EmailBody, { key: 'email', message, api })
    : null;
