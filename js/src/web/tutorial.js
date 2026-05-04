// Tutorial overlay for the SPA (issue #10).
//
// Headline goals (R-M9 .. R-M12):
//   - walk a brand-new user through the key flows step by step
//   - skip a step individually
//   - turn the tutorial off completely (preference persists)
//   - re-open the tutorial later from a header button
//
// The component is intentionally tiny (~150 lines of React) so it can
// ship under the same Unlicense as the rest of the repo without
// pulling in an MIT or AGPL tour library. See
// docs/case-studies/issue-10/external-research.md section 3 for the
// licensing analysis.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

export const TUTORIAL_STORAGE_KEY = 'metaSovereignTutorial';

// Default tour steps. `target` is a `data-view` attribute on the nav
// buttons so the overlay can highlight the right tab; an undefined
// target means "shell-level step". The English `title` / `body`
// strings double as the source-language fallback when no translator
// is supplied (the i18n parity test guarantees the same keys exist
// for every locale — see issue #18).
export const defaultSteps = [
  {
    id: 'welcome',
    titleKey: 'tutorial.welcome.title',
    bodyKey: 'tutorial.welcome.body',
    title: 'Welcome to meta-sovereign',
    body: 'This is your local-first personal CRM and unified inbox. Nothing leaves your browser unless you point it at a server. Hit "Next" to walk through the headline flows.',
  },
  {
    id: 'chat',
    target: 'chat',
    titleKey: 'tutorial.chat.title',
    bodyKey: 'tutorial.chat.body',
    title: 'Chat — your unified inbox',
    body: 'Every chat from every connected service shows up here. If a section is empty, it explains how to plug in a provider — try opening the "Chat" tab once you finish the tour.',
  },
  {
    id: 'contacts',
    target: 'contacts',
    titleKey: 'tutorial.contacts.title',
    bodyKey: 'tutorial.contacts.body',
    title: 'Contacts — one row per person',
    body: 'Contacts are merged across networks. Connect at least one provider to populate this list.',
  },
  {
    id: 'automation',
    target: 'automation',
    titleKey: 'tutorial.automation.title',
    bodyKey: 'tutorial.automation.body',
    title: 'Automation — patterns to replies',
    body: 'Build node graphs that route incoming messages from a regex pattern to a reply variation. Patterns + reply groups feed this graph editor.',
  },
  {
    id: 'backup',
    target: 'backup',
    titleKey: 'tutorial.backup.title',
    bodyKey: 'tutorial.backup.body',
    title: 'Backup — encrypted at rest',
    body: 'Backups encrypt the local store with a passphrase. If you started a local server, the archive lives next to the server data directory.',
  },
];

// Translate a step list with the active locale's `t()`. Steps without
// translation keys (custom callers, tests) keep their literal strings.
export const localizeSteps = (t, steps = defaultSteps) =>
  steps.map((step) => ({
    ...step,
    title: step.titleKey ? t(step.titleKey) : step.title,
    body: step.bodyKey ? t(step.bodyKey) : step.body,
  }));

export const readPreference = (storage) => {
  try {
    const raw = storage?.getItem?.(TUTORIAL_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const writePreference = (storage, value) => {
  try {
    storage?.setItem?.(TUTORIAL_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be disabled in restricted browser contexts.
  }
};

export const clearPreference = (storage) => {
  try {
    storage?.removeItem?.(TUTORIAL_STORAGE_KEY);
  } catch {
    // See readPreference().
  }
};

export const stepIndexFromPreference = (steps, pref) => {
  if (!Array.isArray(steps) || steps.length === 0 || pref?.off) {
    return 0;
  }
  if (typeof pref?.stepId === 'string') {
    const index = steps.findIndex((step) => step.id === pref.stepId);
    if (index >= 0) {
      return index;
    }
  }
  return 0;
};

export const readProgressIndex = (storage, steps) =>
  stepIndexFromPreference(steps, readPreference(storage));

export const writeProgressPreference = (storage, step) => {
  if (!step?.id) {
    return;
  }
  writePreference(storage, { stepId: step.id, at: Date.now() });
};

export const writeCompletedPreference = (storage) =>
  writePreference(storage, { off: true, completed: true, at: Date.now() });

// Returns a small controller object: { isOff, dismiss, complete, reopen }.
export const useTutorialPreference = (storage = globalThis.localStorage) => {
  const [pref, setPref] = useState(() => readPreference(storage));
  const setPreference = (next) => {
    setPref(next);
    writePreference(storage, next);
  };
  const dismiss = () => {
    setPreference({ off: true, at: Date.now() });
  };
  const complete = () => {
    setPreference({ off: true, completed: true, at: Date.now() });
  };
  const reopen = () => {
    setPref(null);
    clearPreference(storage);
  };
  return {
    isOff: Boolean(pref?.off),
    dismiss,
    complete,
    reopen,
  };
};

const Step = ({ step, index, total, onNext, onSkip, onDismiss }) => {
  const t = useT();
  return el(
    'section',
    {
      className: 'tutorial-step card',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': `tutorial-step-${step.id}`,
      'data-tutorial-step': step.id,
    },
    [
      el('h2', { key: 'h', id: `tutorial-step-${step.id}` }, step.title),
      el('p', { key: 'body' }, step.body),
      el(
        'div',
        { key: 'meta', className: 'meta' },
        t('tutorial.progress', { current: index + 1, total })
      ),
      el('div', { key: 'actions', className: 'row' }, [
        el(
          'button',
          {
            key: 'skip',
            type: 'button',
            'data-action': 'tutorial-skip',
            onClick: onSkip,
          },
          t('tutorial.skip')
        ),
        el(
          'button',
          {
            key: 'next',
            type: 'button',
            className: 'primary',
            'data-action': 'tutorial-next',
            onClick: onNext,
          },
          index + 1 === total ? t('tutorial.finish') : t('tutorial.next')
        ),
        el(
          'button',
          {
            key: 'off',
            type: 'button',
            'data-action': 'tutorial-off',
            onClick: onDismiss,
          },
          t('tutorial.off')
        ),
      ]),
    ]
  );
};

// `<TutorialOverlay />` mounts at the SPA shell. It is a no-op when the
// preference is dismissed, so re-opening is a single toggle in the
// header (R-M12).
export const TutorialOverlay = ({
  open,
  steps = defaultSteps,
  storage = globalThis.localStorage,
  onClose,
  onDismiss,
  onComplete,
}) => {
  const t = useT();
  const localized = localizeSteps(t, steps);
  const [index, setIndex] = useState(() =>
    readProgressIndex(storage, localized)
  );
  const total = localized.length;

  // Pick up persisted progress after a page load or explicit reopen.
  // We key this effect on `steps` (the source list, identity-stable
  // across renders) rather than the freshly-localized array so the
  // effect doesn't re-fire on every locale change.
  useEffect(() => {
    if (open) {
      setIndex(readProgressIndex(storage, localized));
    }
  }, [open, steps, storage]);

  if (!open || readPreference(storage)?.off) {
    return null;
  }
  const safeIndex = index >= 0 && index < total ? index : 0;
  const step = localized[safeIndex];
  if (!step) {
    return null;
  }

  const advance = () => {
    if (safeIndex + 1 >= total) {
      if (onComplete) {
        onComplete();
      } else {
        writeCompletedPreference(storage);
      }
      setIndex(0);
      onClose?.();
      return;
    }
    const nextIndex = safeIndex + 1;
    setIndex(nextIndex);
    writeProgressPreference(storage, steps[nextIndex]);
  };
  const skip = () => advance();
  const dismiss = () => {
    if (onDismiss) {
      onDismiss();
    } else {
      writePreference(storage, { off: true, at: Date.now() });
    }
    setIndex(0);
    onClose?.();
  };

  return el(
    'div',
    {
      className: 'tutorial-overlay',
      role: 'presentation',
      'data-tutorial-overlay': '',
    },
    el(Step, {
      step,
      index: safeIndex,
      total,
      onNext: advance,
      onSkip: skip,
      onDismiss: dismiss,
    })
  );
};

export const TutorialButton = ({ onOpen }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: 'tutorial-toggle',
      'data-action': 'tutorial-open',
      'aria-label': t('header.tutorialAria'),
      onClick: onOpen,
    },
    t('header.tutorial')
  );
};
