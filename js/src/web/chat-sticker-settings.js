// Settings → Stickers and emoji, as Telegram Desktop has it (R-Y169;
// learned, never copied): the installed sticker sets in the user's order
// (custom emoji sets on a second tab), each with its cover, title and
// count. A set moves up or down (or is dragged) to a new place, is
// archived or removed (after an in-page question); "Archived stickers"
// lists the archived sets, a page at a time, each with Add to bring it
// back. The sticker panel in the composer asks its lists again after
// every change. "Clear recent stickers" empties the panel's recent list and
// "Quick reaction" chooses the double-click reaction (R-Y206).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { SetThumb, forgetStickers } from './chat-stickers.js';
import { countKey, moveItem, orderIds } from './sticker-settings-model.js';
import { QuickReactionPicker } from './chat-quick-reaction.js';

const el = React.createElement;

const PAGE = 20;

const errorText = (t, code) => {
  const key = `chat.stickerSettings.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.stickerSettings.err.failed') : text;
};

const Button = ({ action, label, onClick, disabled, danger }) =>
  el(
    'button',
    {
      type: 'button',
      className: danger ? 'danger' : undefined,
      'data-action': action,
      disabled,
      onClick,
    },
    label
  );

const Ask = ({ t, set, yes, no }) =>
  el('span', { className: 'privacy-confirm', 'data-confirm': 'remove-set' }, [
    el(
      'span',
      { key: 't' },
      t('chat.stickerSettings.confirmRemove', { title: set.title })
    ),
    el(Button, {
      key: 'y',
      action: 'confirm-remove-set',
      label: t('chat.stickerSettings.confirmYes'),
      onClick: yes,
      danger: true,
    }),
    el(Button, {
      key: 'n',
      action: 'cancel-remove-set',
      label: t('chat.stickerSettings.confirmNo'),
      onClick: no,
    }),
  ]);

// The buttons of an installed set: up, down, Archive, Remove.
const InstalledButtons = ({ t, index, last, busy, act }) => [
  el(Button, {
    key: 'u',
    action: 'set-up',
    label: t('chat.stickerSettings.up'),
    disabled: busy || index === 0,
    onClick: () => act.move(index, index - 1),
  }),
  el(Button, {
    key: 'd',
    action: 'set-down',
    label: t('chat.stickerSettings.down'),
    disabled: busy || last,
    onClick: () => act.move(index, index + 1),
  }),
  el(Button, {
    key: 'a',
    action: 'set-archive',
    label: t('chat.stickerSettings.archive'),
    disabled: busy,
    onClick: act.archive,
  }),
  el(Button, {
    key: 'r',
    action: 'set-remove',
    label: t('chat.stickerSettings.remove'),
    disabled: busy,
    onClick: act.ask,
  }),
];

const SetRow = ({ api, t, set, index, last, archived, busy, act, drag }) => {
  const [asking, setAsking] = useState(false);
  const own = {
    ...act,
    ask: () => setAsking(true),
    archive: () => act.archive(set),
  };
  return el(
    'li',
    {
      className: 'sticker-setting-row',
      'data-set': set.id,
      draggable: !archived && !busy,
      onDragStart: () => {
        drag.current = index;
      },
      onDragOver: (event) => !archived && event.preventDefault(),
      onDrop: (event) => {
        event.preventDefault();
        if (drag.current !== null) {
          act.move(drag.current, index);
        }
        drag.current = null;
      },
    },
    [
      el(
        'span',
        { key: 'c', className: 'sticker-setting-cover' },
        el(SetThumb, { api, set })
      ),
      el('span', { key: 'n', className: 'sticker-setting-name' }, [
        el('strong', { key: 't' }, set.title),
        el(
          'span',
          { key: 'k', className: 'meta' },
          t(countKey(set), { count: set.count })
        ),
      ]),
      asking
        ? el(Ask, {
            key: 'q',
            t,
            set,
            yes: () => {
              setAsking(false);
              act.remove(set);
            },
            no: () => setAsking(false),
          })
        : el(
            'span',
            { key: 'b', className: 'sticker-setting-buttons' },
            archived
              ? el(Button, {
                  label: t('chat.stickerSettings.add'),
                  action: 'set-add',
                  disabled: busy,
                  onClick: () => act.add(set),
                })
              : InstalledButtons({ t, index, last, busy, act: own })
          ),
    ]
  );
};

// The installed (or archived) sets of one kind, and what is done to them.
const useSets = ({ api, emojis, archived, setError, t }) => {
  const [state, setState] = useState({
    phase: 'loading',
    sets: [],
    next: null,
  });
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async (offsetId) => {
      const answer = await (
        archived
          ? api.telegramStickerSetsArchived({
              emojis,
              limit: PAGE,
              ...(offsetId ? { offsetId } : {}),
            })
          : api.telegramStickerSets({ emojis })
      ).catch(() => null);
      if (!answer?.ok) {
        setError(errorText(t, answer?.code));
        setState((old) => ({ ...old, phase: 'error' }));
        return;
      }
      setState((old) => ({
        phase: 'ready',
        sets: offsetId ? [...old.sets, ...answer.sets] : answer.sets,
        next: answer.next ?? null,
      }));
    },
    [api, emojis, archived, setError, t]
  );
  useEffect(() => {
    load(null);
  }, [load]);
  // Runs one request; `after` updates the list when Telegram agreed.
  const run = async (ask, after) => {
    setBusy(true);
    const answer = await ask().catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setError(null);
      forgetStickers();
      setState((old) => ({ ...old, sets: after(old.sets) }));
    } else {
      setError(errorText(t, answer?.code));
      load(null);
    }
  };
  return { state, busy, load, run };
};

const SetList = ({ api, emojis, archived, setError }) => {
  const t = useT();
  const drag = useRef(null);
  const { state, busy, load, run } = useSets({
    api,
    emojis,
    archived,
    setError,
    t,
  });
  const without = (set) => (sets) => sets.filter((s) => s.id !== set.id);
  const act = {
    move: (from, to) => {
      const sets = moveItem(state.sets, from, to);
      if (sets !== state.sets) {
        run(
          () => api.telegramStickerSetsReorder({ ids: orderIds(sets), emojis }),
          () => sets
        );
      }
    },
    archive: (set) =>
      run(() => api.telegramStickerSetArchive({ id: set.id }), without(set)),
    remove: (set) =>
      run(() => api.telegramStickerSetRemove({ id: set.id }), without(set)),
    add: (set) =>
      run(() => api.telegramStickerSetAdd({ id: set.id }), without(set)),
  };
  if (state.phase === 'loading') {
    return el('p', { className: 'meta' }, t('chat.stickerSettings.loading'));
  }
  return el('div', { className: 'sticker-setting-list' }, [
    state.sets.length === 0 && state.phase === 'ready'
      ? el(
          'p',
          { key: 'n', className: 'meta' },
          t(
            archived
              ? 'chat.stickerSettings.noArchived'
              : 'chat.stickerSettings.none'
          )
        )
      : null,
    el(
      'ul',
      { key: 'l', className: 'chat-pick-list' },
      state.sets.map((set, index) =>
        el(SetRow, {
          key: set.id,
          api,
          t,
          set,
          index,
          last: index === state.sets.length - 1,
          archived,
          busy,
          act,
          drag,
        })
      )
    ),
    state.next
      ? el(Button, {
          key: 'm',
          action: 'more-archived',
          label: t('chat.stickerSettings.more'),
          onClick: () => load(state.next),
        })
      : null,
  ]);
};

// "Clear recent stickers" (R-Y206), after an in-page question.
const ClearRecent = ({ api, setError }) => {
  const t = useT();
  const [step, setStep] = useState('idle'); // idle | ask | busy | done
  if (typeof api?.telegramStickerRecentClear !== 'function') {
    return null;
  }
  const clear = async () => {
    setStep('busy');
    const answer = await Promise.resolve(
      api.telegramStickerRecentClear()
    ).catch(() => null);
    if (answer?.ok) {
      setError(null);
      forgetStickers();
      setStep('done');
    } else {
      setError(errorText(t, answer?.code));
      setStep('idle');
    }
  };
  if (step === 'ask' || step === 'busy') {
    return el(
      'span',
      { className: 'privacy-confirm', 'data-confirm': 'clear-recent' },
      [
        el('span', { key: 't' }, t('chat.extras.clearAsk')),
        el(Button, {
          key: 'y',
          action: 'confirm-clear-recent',
          label: t('chat.extras.clearYes'),
          onClick: clear,
          disabled: step === 'busy',
          danger: true,
        }),
        el(Button, {
          key: 'n',
          action: 'cancel-clear-recent',
          label: t('chat.stickerSettings.confirmNo'),
          onClick: () => setStep('idle'),
          disabled: step === 'busy',
        }),
      ]
    );
  }
  return el('span', { className: 'sticker-clear-recent' }, [
    el(Button, {
      key: 'c',
      action: 'clear-recent',
      label: t('chat.extras.clearRecent'),
      onClick: () => setStep('ask'),
    }),
    step === 'done'
      ? el(
          'span',
          { key: 'd', className: 'meta', 'data-done': 'clear-recent' },
          t('chat.extras.cleared')
        )
      : null,
  ]);
};

const Tab = ({ name, current, label, onClick }) =>
  el(
    'button',
    {
      type: 'button',
      role: 'tab',
      className: current === name ? 'sticker-tab active' : 'sticker-tab',
      'aria-selected': current === name,
      'data-tab': name,
      onClick,
    },
    label
  );

/** The dialog: the sets by kind, the archived ones one click away. */
export const StickerSettingsDialog = ({ api, close }) => {
  const t = useT();
  const [kind, setKind] = useState('stickers');
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState(null);
  const choose = (next) => {
    setError(null);
    setKind(next);
  };
  return el(
    FormDialog,
    {
      name: 'sticker-settings',
      title: t('chat.stickerSettings.title'),
      onClose: close,
      onSubmit: close,
      submit: t('chat.stickerSettings.done'),
      busy: false,
      error,
      outside: true,
    },
    [
      // The double-click reaction (R-Y206).
      el(QuickReactionPicker, { key: 'q', api, onError: setError }),
      el('div', { key: 't', className: 'sticker-tabs', role: 'tablist' }, [
        el(Tab, {
          key: 's',
          name: 'stickers',
          current: kind,
          label: t('chat.stickerSettings.stickers'),
          onClick: () => choose('stickers'),
        }),
        el(Tab, {
          key: 'e',
          name: 'emoji',
          current: kind,
          label: t('chat.stickerSettings.emoji'),
          onClick: () => choose('emoji'),
        }),
      ]),
      kind === 'stickers' && !archived
        ? el(ClearRecent, { key: 'cr', api, setError })
        : null,
      el(Button, {
        key: 'a',
        action: 'toggle-archived',
        label: t(
          archived
            ? 'chat.stickerSettings.showInstalled'
            : 'chat.stickerSettings.showArchived'
        ),
        onClick: () => {
          setError(null);
          setArchived(!archived);
        },
      }),
      el(SetList, {
        key: `${kind}-${archived}`,
        api,
        emojis: kind === 'emoji',
        archived,
        setError,
      }),
    ]
  );
};
