// Greetings view (issue #35).
//
// Opening a dialog is the slow part of talking to people, so this
// screen does it in bulk the way konard/vk-bot does on VK: pick the
// greeting stickers and phrases, see what each network allows, preview
// which chats would be greeted and send. Sticker pictures are direct
// links (vk.com) or go through the server's Telegram thumbnail proxy —
// no artwork is copied into the app.
//
// The `api` is injected (defaulting to ./dom.js) so the screen renders
// in tests without booting the offline client.

import React, { useCallback, useEffect, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useT } from './i18n.js';

const el = React.createElement;

/** vk-bot waits 30 s between greetings; the server caps it at 60 s. */
const DEFAULT_DELAY_S = 30;

export const stickerKey = (sticker) =>
  `${sticker.network}:${sticker.id ?? sticker.url}`;

/**
 * Every sticker the screen can offer: the built-in catalogue, what a
 * live listing returned and whatever the saved selection holds, each
 * once. Exported for `js/tests/greetings-web.test.js`.
 */
export const offeredStickers = ({ catalogue, live = [], selection }) => {
  const seen = new Map();
  const all = [
    ...Object.values(catalogue?.stickers ?? {}).flat(),
    ...live,
    ...(selection?.stickers ?? []),
  ];
  for (const sticker of all) {
    const key = stickerKey(sticker);
    seen.set(key, { ...seen.get(key), ...sticker });
  }
  return [...seen.values()];
};

/** Shape a thrown error like the `failures` the API returns. */
export const clientFailure = (name, error) => ({
  network: name,
  error: String(error?.message ?? error),
});

const button = (id, label, { disabled, onClick, className }) =>
  el(
    'button',
    {
      key: id,
      type: 'button',
      className,
      'data-action': `greetings-${id}`,
      disabled,
      onClick,
    },
    label
  );

const initiateLabel = (network, t) =>
  network.initiate === 'window'
    ? t('greetings.initiate.window', { hours: network.windowHours })
    : t(`greetings.initiate.${network.initiate}`);

const NetworksTable = ({ networks }) => {
  const t = useT();
  return el('table', { className: 'greetings-networks stack-table' }, [
    el(
      'thead',
      { key: 'head' },
      el('tr', null, [
        el('th', { key: 'network' }, t('greetings.network')),
        el('th', { key: 'sticker' }, t('greetings.addressing')),
        el('th', { key: 'initiate' }, t('greetings.initiate')),
        el('th', { key: 'note' }, t('greetings.note')),
      ])
    ),
    el(
      'tbody',
      { key: 'body' },
      Object.entries(networks ?? {}).map(([id, network]) =>
        el('tr', { key: id, 'data-network': id }, [
          el('td', { key: 'network', 'data-title': '' }, id),
          el(
            'td',
            {
              key: 'sticker',
              className: 'meta',
              'data-label': t('greetings.addressing'),
            },
            network.sticker ?? t('greetings.textOnly')
          ),
          el(
            'td',
            { key: 'initiate', 'data-label': t('greetings.initiate') },
            initiateLabel(network, t)
          ),
          el(
            'td',
            {
              key: 'note',
              className: 'meta',
              'data-label': t('greetings.note'),
            },
            network.note
          ),
        ])
      )
    ),
  ]);
};

const stickerLabel = (sticker) =>
  [sticker.emoji, sticker.pack ?? sticker.packTitle, sticker.id]
    .filter(Boolean)
    .join(' · ');

const StickerCard = ({ sticker, checked, onToggle }) => {
  const t = useT();
  const label = stickerLabel(sticker);
  return el(
    'label',
    {
      className: `greetings-sticker${checked ? ' selected' : ''}`,
      'data-sticker': stickerKey(sticker),
      title: label,
    },
    [
      sticker.previewUrl
        ? el('img', {
            key: 'img',
            src: sticker.previewUrl,
            alt: label,
            loading: 'lazy',
            width: 96,
            height: 96,
          })
        : el(
            'span',
            { key: 'emoji', className: 'greetings-emoji', 'aria-hidden': true },
            sticker.emoji ?? '👋'
          ),
      el('span', { key: 'pick', className: 'row' }, [
        el('input', {
          key: 'box',
          type: 'checkbox',
          checked,
          'aria-label': t('greetings.pick', { label }),
          onChange: () => onToggle(sticker),
        }),
        el('span', { key: 'net', className: 'meta' }, sticker.network),
      ]),
    ]
  );
};

const StickerGrid = ({ state }) => {
  const t = useT();
  const picked = new Set(
    (state.selection?.stickers ?? []).map((sticker) => stickerKey(sticker))
  );
  const stickers = offeredStickers(state);
  return el('div', { className: 'col' }, [
    el(
      'p',
      { key: 'count', className: 'meta', 'data-selected': picked.size },
      t('greetings.selected', { count: picked.size, total: stickers.length })
    ),
    el(
      'div',
      { key: 'grid', className: 'greetings-grid' },
      stickers.map((sticker) =>
        el(StickerCard, {
          key: stickerKey(sticker),
          sticker,
          checked: picked.has(stickerKey(sticker)),
          onToggle: state.toggleSticker,
        })
      )
    ),
  ]);
};

const TelegramSets = ({ state }) => {
  const t = useT();
  const chosen = new Set(state.selection?.telegramSets ?? []);
  const defaults = state.catalogue?.telegram?.defaultGreetings;
  return el('div', { className: 'col greetings-sets' }, [
    defaults
      ? el(
          'p',
          { key: 'defaults', className: 'meta' },
          t('greetings.telegramDefault', {
            method: defaults.method,
            emoticon: defaults.emoticon,
          })
        )
      : null,
    el('p', { key: 'h' }, t('greetings.sets')),
    el(
      'ul',
      { key: 'sets', className: 'row greetings-set-list' },
      (state.catalogue?.telegram?.sets ?? []).map((set) =>
        el('li', { key: set.name, 'data-set': set.name }, [
          el('input', {
            key: 'box',
            type: 'checkbox',
            checked: chosen.has(set.name),
            'aria-label': set.name,
            onChange: () => state.toggleSet(set.name),
          }),
          el(
            'a',
            {
              key: 'link',
              href: set.addUrl,
              target: '_blank',
              rel: 'noreferrer',
            },
            set.name
          ),
        ])
      )
    ),
  ]);
};

const select = (id, label, value, options, onChange) =>
  el('label', { key: id, className: 'col greetings-field' }, [
    el('span', { key: 'l', className: 'meta' }, label),
    el(
      'select',
      {
        key: 's',
        value,
        'data-field': id,
        onChange: (event) => onChange(event.target.value),
      },
      options.map(([option, text]) =>
        el('option', { key: option, value: option }, text)
      )
    ),
  ]);

const SelectionControls = ({ state }) => {
  const t = useT();
  const selection = state.selection ?? {};
  const idle = state.busy === '';
  return el('div', { className: 'row greetings-controls' }, [
    select(
      'language',
      t('greetings.language'),
      selection.language ?? 'en',
      Object.keys(selection.texts ?? state.catalogue?.texts ?? {}).map(
        (lang) => [lang, lang]
      ),
      (language) => state.update({ language })
    ),
    select(
      'prefer',
      t('greetings.prefer'),
      selection.prefer ?? 'sticker',
      [
        ['sticker', t('greetings.prefer.sticker')],
        ['text', t('greetings.prefer.text')],
      ],
      (prefer) => state.update({ prefer })
    ),
    button('list-live', t('greetings.listLive'), {
      disabled: !idle,
      onClick: state.listLive,
    }),
    button('save', t('greetings.save'), {
      className: 'primary',
      disabled: !idle || !state.dirty,
      onClick: state.save,
    }),
  ]);
};

const PlanControls = ({ state }) => {
  const t = useT();
  const idle = state.busy === '';
  return el('div', { className: 'row greetings-controls' }, [
    select(
      'mode',
      t('greetings.mode'),
      state.mode,
      [
        ['initiate', t('greetings.mode.initiate')],
        ['reply', t('greetings.mode.reply')],
      ],
      state.setMode
    ),
    el('label', { key: 'delay', className: 'col greetings-field' }, [
      el('span', { key: 'l', className: 'meta' }, t('greetings.delay')),
      el('input', {
        key: 'i',
        type: 'number',
        min: 0,
        max: 60,
        value: state.delaySeconds,
        'data-field': 'delay',
        onChange: (event) => state.setDelaySeconds(event.target.value),
      }),
    ]),
    button('preview', t('greetings.preview'), {
      disabled: !idle,
      onClick: state.preview,
    }),
    button('send', t('greetings.send'), {
      className: 'danger',
      disabled: !idle || !state.plan?.envelopes?.some((e) => !e.skipped),
      onClick: state.send,
    }),
  ]);
};

const greetingOf = (envelope) =>
  envelope.kind === 'sticker'
    ? `${envelope.sticker?.emoji ?? '🖼'} ${envelope.sticker?.id ?? envelope.sticker?.url ?? ''}`
    : (envelope.text ?? '—');

const envelopeStatus = (envelope, result, t) => {
  if (result) {
    return result.ok ? t('greetings.sent') : `! ${result.error}`;
  }
  return envelope.skipped
    ? t('greetings.skipped', { reason: envelope.skipped })
    : t('greetings.ready');
};

const PlanTable = ({ plan, results }) => {
  const t = useT();
  if (!plan) {
    return el('p', { className: 'meta' }, t('greetings.noPlan'));
  }
  if (plan.envelopes.length === 0) {
    return el('p', { className: 'meta' }, t('greetings.emptyPlan'));
  }
  const resultFor = (envelope) =>
    (results ?? []).find(
      (r) => r.network === envelope.network && r.chat === envelope.chat
    );
  return el('table', { className: 'greetings-plan stack-table' }, [
    el(
      'thead',
      { key: 'head' },
      el('tr', null, [
        el('th', { key: 'network' }, t('greetings.network')),
        el('th', { key: 'chat' }, t('greetings.chat')),
        el('th', { key: 'lang' }, t('greetings.lang')),
        el('th', { key: 'what' }, t('greetings.what')),
        el('th', { key: 'status' }, t('greetings.status')),
      ])
    ),
    el(
      'tbody',
      { key: 'body' },
      plan.envelopes.map((envelope) =>
        el(
          'tr',
          {
            key: `${envelope.network}:${envelope.chat}`,
            'data-chat': `${envelope.network}:${envelope.chat}`,
            'data-skipped': envelope.skipped ?? '',
          },
          [
            el(
              'td',
              { key: 'network', 'data-label': t('greetings.network') },
              envelope.network
            ),
            el(
              'td',
              { key: 'chat', 'data-title': '' },
              envelope.contact ?? envelope.chat
            ),
            el(
              'td',
              {
                key: 'lang',
                className: 'meta',
                'data-label': t('greetings.lang'),
              },
              envelope.language
            ),
            el(
              'td',
              { key: 'what', 'data-label': t('greetings.what') },
              greetingOf(envelope)
            ),
            el(
              'td',
              {
                key: 'status',
                className: 'meta',
                'data-label': t('greetings.status'),
              },
              envelopeStatus(envelope, resultFor(envelope), t)
            ),
          ]
        )
      )
    ),
  ]);
};

const Failures = ({ failures }) =>
  (failures ?? []).length === 0
    ? null
    : el(
        'ul',
        { className: 'greetings-failures', role: 'alert' },
        failures.map((failure, index) =>
          el(
            'li',
            {
              key: `${failure.network}-${index}`,
              'data-network': failure.network,
            },
            `${failure.network}${failure.pack ? ` ${failure.pack}` : ''}: ${failure.error}`
          )
        )
      );

/**
 * Telegram thumbnails go through the server (the download URL embeds
 * the bot token); without one the card shows the emoji instead.
 */
const withPreviews = async (api, stickers) =>
  Promise.all(
    stickers.map(async (sticker) =>
      sticker.network === 'telegram' && !sticker.previewUrl
        ? {
            ...sticker,
            previewUrl: await api.greetingFileUrl(
              sticker.thumbnailFileId ??
                (sticker.format === 'webp' ? sticker.id : null)
            ),
          }
        : sticker
    )
  );

const useLoad = (api, setters) => {
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.greetingCatalogue(), api.greetingSelection()])
      .then(([catalogue, selection]) => {
        if (!cancelled) {
          setters.setCatalogue(catalogue);
          setters.setSelection(selection);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setters.setFailures([clientFailure('load', error)]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api]);
};

const toggleIn = (list, item, same) =>
  list.some((entry) => same(entry, item))
    ? list.filter((entry) => !same(entry, item))
    : [...list, item];

/** Everything the screen does, kept out of the render for clarity. */
const useGreetingsState = (api) => {
  const [catalogue, setCatalogue] = useState(null);
  const [selection, setSelection] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [live, setLive] = useState([]);
  const [busy, setBusy] = useState('');
  const [failures, setFailures] = useState([]);
  const [mode, setMode] = useState('initiate');
  const [delaySeconds, setDelaySeconds] = useState(DEFAULT_DELAY_S);
  const [plan, setPlan] = useState(null);
  const [results, setResults] = useState(null);
  useLoad(api, { setCatalogue, setSelection, setFailures });

  const run = useCallback(async (name, fn) => {
    setBusy(name);
    setFailures([]);
    try {
      return await fn();
    } catch (error) {
      setFailures([clientFailure(name, error)]);
      return null;
    } finally {
      setBusy('');
    }
  }, []);

  const update = useCallback((patch) => {
    setSelection((current) => ({ ...current, ...patch }));
    setDirty(true);
    setSaved(false);
  }, []);

  const toggleSticker = useCallback(
    (sticker) =>
      update({
        stickers: toggleIn(
          selection?.stickers ?? [],
          sticker,
          (a, b) => stickerKey(a) === stickerKey(b)
        ),
      }),
    [update, selection]
  );

  const toggleSet = useCallback(
    (name) =>
      update({
        telegramSets: toggleIn(
          selection?.telegramSets ?? [],
          name,
          (a, b) => a === b
        ),
      }),
    [update, selection]
  );

  const listLive = useCallback(
    () =>
      run('list-live', async () => {
        const result = await api.greetingStickers(['vk', 'telegram']);
        setLive(await withPreviews(api, result.stickers ?? []));
        setFailures(result.failures ?? []);
      }),
    [api, run]
  );

  const save = useCallback(
    () =>
      run('save', async () => {
        setSelection(await api.saveGreetingSelection(selection));
        setDirty(false);
        setSaved(true);
      }),
    [api, run, selection]
  );

  const planRun = useCallback(
    (queue) =>
      run(queue ? 'send' : 'preview', async () => {
        if (dirty) {
          setSelection(await api.saveGreetingSelection(selection));
          setDirty(false);
        }
        const answer = await api.greetingPlan({
          mode,
          ...(queue
            ? { run: 'queue', delayMs: Number(delaySeconds) * 1000 }
            : {}),
        });
        setPlan(queue ? (answer.plan ?? plan) : answer);
        setResults(queue ? answer.results : null);
        setFailures(answer.failures ?? []);
      }),
    [api, run, dirty, selection, mode, delaySeconds, plan]
  );

  return {
    catalogue,
    selection,
    dirty,
    saved,
    live,
    busy,
    failures,
    mode,
    delaySeconds,
    plan,
    results,
    update,
    toggleSticker,
    toggleSet,
    listLive,
    save,
    setMode,
    setDelaySeconds,
    preview: () => planRun(false),
    send: () => planRun(true),
  };
};

/**
 * The screen itself, pure: everything it shows comes from `state`.
 * Rendering it directly (see `js/tests/greetings-web.test.js`)
 * exercises the whole surface without a browser or a server.
 */
export const GreetingsScreen = ({ state }) => {
  const t = useT();
  return el('div', { className: 'col greetings-view' }, [
    el('h2', { key: 'h' }, t('greetings.title')),
    el('p', { key: 'intro', className: 'meta' }, t('greetings.intro')),
    el(Failures, { key: 'failures', failures: state.failures }),
    state.busy
      ? el('p', { key: 'busy', className: 'meta' }, t('greetings.busy'))
      : null,
    el('h3', { key: 'stickers-h' }, t('greetings.stickers')),
    el(SelectionControls, { key: 'selection', state }),
    state.saved
      ? el('p', { key: 'saved', className: 'meta' }, t('greetings.saved'))
      : null,
    el(StickerGrid, { key: 'grid', state }),
    el(TelegramSets, { key: 'sets', state }),
    el('h3', { key: 'plan-h' }, t('greetings.planTitle')),
    el(PlanControls, { key: 'plan-controls', state }),
    el(PlanTable, { key: 'plan', plan: state.plan, results: state.results }),
    el('h3', { key: 'networks-h' }, t('greetings.networks')),
    el(NetworksTable, { key: 'networks', networks: state.catalogue?.networks }),
  ]);
};

export const GreetingsView = ({ api = defaultApi }) =>
  el(GreetingsScreen, { state: useGreetingsState(api) });
