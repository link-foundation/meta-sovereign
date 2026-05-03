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

import React, { useEffect, useMemo, useState } from 'react';

const el = React.createElement;

export const TUTORIAL_STORAGE_KEY = 'metaSovereignTutorial';

// Default tour steps. `target` is a `data-view` attribute on the nav
// buttons so the overlay can highlight the right tab; an undefined
// target means "shell-level step".
export const defaultSteps = [
  {
    id: 'welcome',
    title: 'Welcome to meta-sovereign',
    body: 'This is your local-first personal CRM and unified inbox. Nothing leaves your browser unless you point it at a server. Hit "Next" to walk through the headline flows.',
  },
  {
    id: 'chat',
    target: 'chat',
    title: 'Chat — your unified inbox',
    body: 'Every chat from every connected service shows up here. If a section is empty, it explains how to plug in a provider — try opening the "Chat" tab once you finish the tour.',
  },
  {
    id: 'contacts',
    target: 'contacts',
    title: 'Contacts — one row per person',
    body: 'Contacts are merged across networks. Connect at least one provider to populate this list.',
  },
  {
    id: 'automation',
    target: 'automation',
    title: 'Automation — patterns to replies',
    body: 'Build node graphs that route incoming messages from a regex pattern to a reply variation. Patterns + reply groups feed this graph editor.',
  },
  {
    id: 'backup',
    target: 'backup',
    title: 'Backup — encrypted at rest',
    body: 'Backups encrypt the local store with a passphrase. If you started a local server, the archive lives next to the server data directory.',
  },
];

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

// Returns a small controller object: { isOff, dismiss, reopen }.
export const useTutorialPreference = (storage = globalThis.localStorage) => {
  const [pref, setPref] = useState(() => readPreference(storage));
  const dismiss = () => {
    const next = { off: true, at: Date.now() };
    setPref(next);
    writePreference(storage, next);
  };
  const reopen = () => {
    setPref(null);
    clearPreference(storage);
  };
  return {
    isOff: Boolean(pref?.off),
    dismiss,
    reopen,
  };
};

const Step = ({ step, index, total, onNext, onSkip, onDismiss }) =>
  el(
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
        `Step ${index + 1} of ${total}`
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
          'Skip step'
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
          index + 1 === total ? 'Finish' : 'Next'
        ),
        el(
          'button',
          {
            key: 'off',
            type: 'button',
            'data-action': 'tutorial-off',
            onClick: onDismiss,
          },
          'Turn off tutorial'
        ),
      ]),
    ]
  );

// `<TutorialOverlay />` mounts at the SPA shell. It is a no-op when the
// preference is dismissed, so re-opening is a single toggle in the
// header (R-M12).
export const TutorialOverlay = ({
  open,
  steps = defaultSteps,
  storage = globalThis.localStorage,
  onClose,
  onDismiss,
}) => {
  const [index, setIndex] = useState(0);
  const total = steps.length;
  const pref = useMemo(() => readPreference(storage), [storage]);

  // Reset to step 0 every time the overlay opens.
  useEffect(() => {
    if (open) {
      setIndex(0);
    }
  }, [open]);

  if (!open || pref?.off) {
    return null;
  }
  const step = steps[index];
  if (!step) {
    return null;
  }

  const advance = () => {
    if (index + 1 >= total) {
      onClose?.();
      return;
    }
    setIndex(index + 1);
  };
  const skip = () => advance();
  const dismiss = () => {
    writePreference(storage, { off: true, at: Date.now() });
    onDismiss?.();
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
      index,
      total,
      onNext: advance,
      onSkip: skip,
      onDismiss: dismiss,
    })
  );
};

export const TutorialButton = ({ onOpen }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'tutorial-toggle',
      'data-action': 'tutorial-open',
      'aria-label': 'Open tutorial',
      onClick: onOpen,
    },
    'Tutorial'
  );
