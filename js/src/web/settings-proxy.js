// Settings → Connection type (R-Y192; learned, never copied): direct (the
// default), a SOCKS5 proxy (host, port, optional user and password) or an
// MTProto proxy (host, port, secret), in a dialog with Check (a short TCP
// connect to the address) and Save. A t.me/proxy or t.me/socks link in a
// chat opens the same dialog prefilled; nothing is saved until Save. The
// password and the secret are write-only: the server never sends them back,
// the page only learns that one is set, and a field left empty keeps it.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { useEsc } from './chat-invite.js';
import {
  PROXY_EVENT,
  openProxyDialog,
  secretLooksRight,
} from './proxy-model.js';

const el = React.createElement;

const SAVED = 'ms-proxy-saved';
const KINDS = ['none', 'socks5', 'mtproto'];
const EMPTY = {
  kind: 'none',
  host: '',
  port: '',
  username: '',
  password: '',
  secret: '',
};

/** The body to save for a form; empty secret fields are left out (kept). */
export const saveBody = (form, { clearPassword = false } = {}) => {
  if (form.kind === 'none') {
    return { kind: 'none' };
  }
  const body = {
    kind: form.kind,
    host: form.host.trim(),
    port: form.port.trim(),
  };
  if (form.kind === 'socks5') {
    body.username = form.username;
    if (form.password) {
      body.password = form.password;
    } else if (clearPassword) {
      body.password = '';
    }
  } else if (form.secret) {
    body.secret = form.secret.trim();
  }
  return body;
};

/** A form from a saved setting (never has a password or secret). */
export const formOf = (proxy) => ({
  ...EMPTY,
  kind: proxy?.kind ?? 'none',
  host: proxy?.host ?? '',
  port: proxy?.port ? String(proxy.port) : '',
  username: proxy?.username ?? '',
});

/** A form from a link's proxy, to be reviewed before Save. */
export const formFromLink = (link) => ({
  ...EMPTY,
  kind: link.kind,
  host: link.host,
  port: String(link.port),
  username: link.username ?? '',
  password: link.password ?? '',
  secret: link.secret ?? '',
});

const errorText = (t, code) => {
  const key = `settings.proxy.err.${code}`;
  const text = t(key);
  return text === key ? t('settings.proxy.err.failed') : text;
};

const Field = ({ t, name, form, set, type = 'text', placeholder }) =>
  el('label', { className: 'chat-form-field' }, [
    el('span', { key: 'l', className: 'meta' }, t(`settings.proxy.${name}`)),
    el('input', {
      key: 'i',
      type,
      value: form[name],
      maxLength: 512,
      placeholder,
      autoComplete: 'off',
      spellCheck: false,
      'data-field': `proxy-${name}`,
      onChange: (event) => set({ [name]: event.target.value }),
    }),
  ]);

const KindChoice = ({ t, form, set }) =>
  el(
    'div',
    { className: 'proxy-kinds', role: 'radiogroup' },
    KINDS.map((kind) =>
      el('label', { key: kind, className: 'check' }, [
        el('input', {
          key: 'i',
          type: 'radio',
          name: 'proxy-kind',
          checked: form.kind === kind,
          'data-action': `proxy-kind-${kind}`,
          onChange: () => set({ kind }),
        }),
        ` ${t(`settings.proxy.kind.${kind}`)}`,
      ])
    )
  );

const Fields = ({ t, form, set, saved }) => {
  const keep = (is) => (is ? t('settings.proxy.keepSet') : undefined);
  if (form.kind === 'socks5') {
    return [
      el(Field, { key: 'h', t, name: 'host', form, set }),
      el(Field, { key: 'p', t, name: 'port', form, set }),
      el(Field, { key: 'u', t, name: 'username', form, set }),
      el(Field, {
        key: 'w',
        t,
        name: 'password',
        form,
        set,
        type: 'password',
        placeholder: keep(saved?.passwordSet),
      }),
    ];
  }
  return form.kind === 'mtproto'
    ? [
        el(Field, { key: 'h', t, name: 'host', form, set }),
        el(Field, { key: 'p', t, name: 'port', form, set }),
        el(Field, {
          key: 's',
          t,
          name: 'secret',
          form,
          set,
          type: 'password',
          placeholder: keep(saved?.secretSet),
        }),
      ]
    : [];
};

// The saved setting, the form over it and what the user is doing.
const useProxyForm = (api, prefill) => {
  const [form, setForm] = useState(prefill ? formFromLink(prefill) : EMPTY);
  const [saved, setSaved] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.resolve(api.telegramProxyGet?.())
      .then((answer) => {
        if (!active) {
          return;
        }
        setSaved(answer?.ok ? answer.proxy : null);
        if (answer?.ok && !prefill) {
          setForm(formOf(answer.proxy));
        }
        setLoaded(true);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [api]);
  return {
    form,
    saved,
    loaded,
    set: (p) => setForm((f) => ({ ...f, ...p })),
    setSaved,
  };
};

const checkMessage = (t, result) => {
  if (!result) {
    return null;
  }
  if (!result.ok) {
    return errorText(t, result.code);
  }
  return result.reachable
    ? t('settings.proxy.reachable', { ms: result.ms })
    : t('settings.proxy.unreachable');
};

const ProxyDialog = ({ api, prefill, close }) => {
  const t = useT();
  const { form, saved, loaded, set, setSaved } = useProxyForm(api, prefill);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [check, setCheck] = useState(null);
  useEsc(close);
  const save = async () => {
    if (
      form.kind === 'mtproto' &&
      form.secret &&
      !secretLooksRight(form.secret)
    ) {
      setError('bad-secret');
      return;
    }
    setBusy(true);
    const answer = await Promise.resolve(
      api.telegramProxySave(saveBody(form))
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setSaved(answer.proxy);
      globalThis.dispatchEvent?.(new CustomEvent(SAVED));
      close();
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  const probe = async () => {
    setBusy(true);
    setCheck(null);
    const answer = await Promise.resolve(
      api.telegramProxyCheck({ host: form.host.trim(), port: form.port.trim() })
    ).catch(() => null);
    setBusy(false);
    setCheck(answer ?? { ok: false, code: 'failed' });
  };
  const checkable =
    form.kind !== 'none' && form.host.trim() && form.port.trim();
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('settings.proxy.title'),
      'data-dialog': 'proxy',
    },
    el('div', { className: 'delete-dialog proxy-dialog' }, [
      el('h3', { key: 'h' }, t('settings.proxy.title')),
      prefill
        ? el(
            'p',
            { key: 'n', className: 'meta', 'data-proxy-from-link': 'true' },
            t('settings.proxy.fromLink')
          )
        : null,
      el(KindChoice, { key: 'k', t, form, set }),
      ...Fields({ t, form, set, saved }),
      check
        ? el(
            'p',
            {
              key: 'c',
              role: 'status',
              'data-proxy-check': check.reachable ? 'ok' : 'fail',
            },
            checkMessage(t, check)
          )
        : null,
      error
        ? el(
            'p',
            { key: 'e', role: 'alert', 'data-proxy-error': error },
            errorText(t, error)
          )
        : null,
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el(
          'button',
          { key: 'x', type: 'button', 'data-action': 'cancel', onClick: close },
          t('settings.proxy.cancel')
        ),
        el(
          'button',
          {
            key: 'k',
            type: 'button',
            'data-action': 'proxy-check',
            disabled: busy || !checkable,
            onClick: probe,
          },
          t('settings.proxy.check')
        ),
        el(
          'button',
          {
            key: 's',
            type: 'button',
            className: 'primary',
            'data-action': 'proxy-save',
            disabled: busy || !loaded,
            onClick: save,
          },
          t('settings.proxy.save')
        ),
      ]),
    ])
  );
};

/** Mounted once: opens the proxy dialog when Settings or a link asks. */
export const ProxyHost = ({ api }) => {
  const [open, setOpen] = useState(null);
  const count = useRef(0);
  useEffect(() => {
    const on = (event) => {
      count.current += 1;
      setOpen({ prefill: event.detail?.prefill ?? null, id: count.current });
    };
    globalThis.addEventListener?.(PROXY_EVENT, on);
    return () => globalThis.removeEventListener?.(PROXY_EVENT, on);
  }, []);
  return open
    ? el(ProxyDialog, {
        key: open.id,
        api,
        prefill: open.prefill,
        close: () => setOpen(null),
      })
    : null;
};

const summary = (t, proxy) =>
  !proxy || proxy.kind === 'none'
    ? t('settings.proxy.kind.none')
    : `${t(`settings.proxy.kind.${proxy.kind}`)}: ${proxy.host}:${proxy.port}`;

/** The Settings section: what is set, and the button to change it. */
export const ProxySettings = ({ api }) => {
  const t = useT();
  const [proxy, setProxy] = useState(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      Promise.resolve(api.telegramProxyGet?.())
        .then((answer) => active && setProxy(answer?.ok ? answer.proxy : null))
        .catch(() => {});
    load();
    globalThis.addEventListener?.(SAVED, load);
    return () => {
      active = false;
      globalThis.removeEventListener?.(SAVED, load);
    };
  }, [api]);
  return el(
    'section',
    { className: 'card proxy-settings', 'aria-labelledby': 'proxy-title' },
    [
      el('h3', { key: 'h', id: 'proxy-title' }, t('settings.proxy.title')),
      el('p', { key: 'i', className: 'meta' }, t('settings.proxy.intro')),
      el(
        'p',
        { key: 's', 'data-proxy-summary': proxy?.kind ?? 'none' },
        summary(t, proxy)
      ),
      el(
        'button',
        {
          key: 'b',
          type: 'button',
          'data-action': 'open-proxy',
          onClick: () => openProxyDialog(),
        },
        t('settings.proxy.change')
      ),
    ]
  );
};
