// Business chat links, as Telegram Desktop's Business settings have them
// (R-Y180; learned, never copied): a list with each link's title, text and
// number of views, Copy, Edit and Delete (asked first), and "Create link".
// Nothing is sent until Save. (A link t.me/m/<slug> in a message opens in
// the app through ./chat-business-link-open.js.)

import React, { useEffect, useState } from 'react';
import { useLocaleContext } from './i18n.js';
import { Field, FormDialog } from './chat-create.js';
import { Frame } from './chat-readers.js';
import {
  errorText,
  useBusinessRead,
  useSaving,
} from './chat-business-common.js';

const el = React.createElement;

export const TEXT_MAX = 4096;
export const TITLE_MAX = 32;

/** What a link is called in the list: its title, else its text. */
export const linkLabel = (link) =>
  link.title || Array.from(link.message).slice(0, 60).join('');

/** Whether the typed link can be saved: some text, a short title. */
export const linkProblem = ({ message, title }) => {
  if (message.trim() === '') {
    return 'text-empty';
  }
  if (Array.from(message).length > TEXT_MAX) {
    return 'text-long';
  }
  return Array.from(title).length > TITLE_MAX ? 'title-long' : null;
};

const copy = async (text) => {
  try {
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const LinkForm = ({ api, t, link, close, done }) => {
  const [form, setForm] = useState({
    message: link?.message ?? '',
    title: link?.title ?? '',
  });
  const saving = useSaving(t, done);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const submit = () => {
    const problem = linkProblem(form);
    if (problem) {
      saving.fail(problem);
      return;
    }
    const body = {
      message: form.message,
      ...(form.title.trim() ? { title: form.title.trim() } : {}),
    };
    saving.save(() =>
      link
        ? api.telegramBusinessLinkEdit({ slug: link.slug, ...body })
        : api.telegramBusinessLinkCreate(body)
    );
  };
  return el(
    FormDialog,
    {
      name: 'business-link-form',
      title: t(
        link ? 'chat.business.links.edit' : 'chat.business.links.create'
      ),
      onClose: close,
      onSubmit: submit,
      submit: t('chat.business.save'),
      busy: saving.busy,
      error: saving.error,
      outside: true,
    },
    [
      el(Field, {
        key: 'm',
        label: t('chat.business.links.message'),
        name: 'link-message',
        area: true,
        value: form.message,
        maxLength: TEXT_MAX,
        autoFocus: true,
        onChange: set('message'),
      }),
      el(Field, {
        key: 't',
        label: t('chat.business.links.name'),
        name: 'link-title',
        value: form.title,
        maxLength: TITLE_MAX,
        onChange: set('title'),
      }),
      el(
        'p',
        { key: 'h', className: 'meta' },
        t('chat.business.links.nameHint')
      ),
    ]
  );
};

const LinkRow = ({ t, link, edit, remove, busy }) => {
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState(false);
  return el('li', { className: 'business-link', 'data-slug': link.slug }, [
    el('div', { key: 'n', className: 'business-link-name' }, [
      el('strong', { key: 'l' }, linkLabel(link)),
      el(
        'span',
        { key: 'v', className: 'meta', 'data-field': 'views' },
        t('chat.business.links.views', { count: link.views })
      ),
    ]),
    el('div', { key: 'u', className: 'meta business-link-url' }, link.link),
    asking
      ? el('div', { key: 'q', className: 'business-link-actions' }, [
          el('span', { key: 't' }, t('chat.business.links.deleteAsk')),
          el(
            'button',
            {
              key: 'y',
              type: 'button',
              className: 'danger',
              'data-action': 'link-delete-confirm',
              disabled: busy,
              onClick: () => remove(link),
            },
            t('chat.business.links.delete')
          ),
          el(
            'button',
            {
              key: 'n',
              type: 'button',
              'data-action': 'link-delete-cancel',
              onClick: () => setAsking(false),
            },
            t('chat.create.cancel')
          ),
        ])
      : el('div', { key: 'a', className: 'business-link-actions' }, [
          el(
            'button',
            {
              key: 'c',
              type: 'button',
              'data-action': 'link-copy',
              onClick: async () => setCopied(await copy(link.link)),
            },
            copied
              ? t('chat.business.links.copied')
              : t('chat.business.links.copy')
          ),
          el(
            'button',
            {
              key: 'e',
              type: 'button',
              'data-action': 'link-edit',
              onClick: () => edit(link),
            },
            t('chat.business.links.editShort')
          ),
          el(
            'button',
            {
              key: 'd',
              type: 'button',
              'data-action': 'link-delete',
              onClick: () => setAsking(true),
            },
            t('chat.business.links.delete')
          ),
        ]),
  ]);
};

const LinksList = ({ api, t, close, links, setLinks }) => {
  const [form, setForm] = useState(null); // { link } | {}
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const remove = async (link) => {
    setBusy(true);
    const answer = await api
      .telegramBusinessLinkDelete({ slug: link.slug })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setError(null);
      setLinks(links.filter((l) => l.slug !== link.slug));
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  // The form replaces the list while it is open (one dialog on top).
  if (form) {
    return el(LinkForm, {
      key: 'form',
      api,
      t,
      link: form.link,
      close: () => setForm(null),
      done: (answer) => {
        setForm(null);
        const made = answer.link;
        setLinks(
          links.some((l) => l.slug === made.slug)
            ? links.map((l) => (l.slug === made.slug ? made : l))
            : [made, ...links]
        );
      },
    });
  }
  return el(
    Frame,
    {
      key: 'f',
      title: t('chat.business.links'),
      close,
      name: 'business-links',
    },
    [
      el('p', { key: 'h', className: 'meta' }, t('chat.business.links.hint')),
      links.length === 0
        ? el(
            'p',
            { key: 'none', className: 'meta' },
            t('chat.business.links.none')
          )
        : el(
            'ul',
            { key: 'l', className: 'business-links' },
            links.map((link) =>
              el(LinkRow, {
                key: link.slug,
                t,
                link,
                busy,
                edit: (l) => setForm({ link: l }),
                remove,
              })
            )
          ),
      error
        ? el(
            'p',
            { key: 'e', role: 'alert', className: 'chat-form-error' },
            error
          )
        : null,
      el(
        'button',
        {
          key: 'c',
          type: 'button',
          className: 'primary',
          'data-action': 'link-create',
          onClick: () => setForm({}),
        },
        t('chat.business.links.create')
      ),
    ]
  );
};

/** Settings → Business → Chat links. */
export const LinksDialog = ({ api, close }) => {
  const { t } = useLocaleContext();
  const read = useBusinessRead(() => api.telegramBusinessLinks());
  const [links, setLinks] = useState(null);
  useEffect(() => {
    if (read.phase === 'ready') {
      setLinks(read.data.links);
    }
  }, [read.phase]);
  if (read.phase === 'ready' && links) {
    return el(LinksList, { api, t, close, links, setLinks });
  }
  return el(
    Frame,
    { title: t('chat.business.links'), close, name: 'business-links' },
    read.phase === 'error'
      ? el(
          'p',
          { role: 'alert', className: 'chat-form-error' },
          errorText(t, read.code)
        )
      : el('p', { className: 'meta' }, t('chat.business.loading'))
  );
};
