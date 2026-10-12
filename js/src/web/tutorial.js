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
import { Icon } from './icons.js';

const el = React.createElement;

export const TUTORIAL_STORAGE_KEY = 'metaSovereignTutorial';

// Default tour steps. `target` is a `data-view` attribute on the nav
// buttons so the overlay can highlight the right tab; an undefined
// target means "shell-level step". The English `title` / `body`
// strings double as the source-language fallback when no translator
// is supplied (the i18n parity test guarantees the same keys exist
// for every locale — see issue #18).
// Brand names shown under the first step so "service" reads as
// something concrete. Proper nouns, so they are not translated.
export const SERVICE_EXAMPLES = [
  'Telegram',
  'WhatsApp',
  'Gmail',
  'Outlook',
  'VK',
  'LinkedIn',
  'X',
  'Facebook',
  'GitHub',
  'Upwork',
];

export const defaultSteps = [
  {
    id: 'connect',
    target: 'connections',
    tutorialId: 'nav:connections',
    titleKey: 'tutorial.connect.title',
    bodyKey: 'tutorial.connect.body',
    title: 'Connect your first service',
    body: 'Bring your chats and contacts into one place. Open Connections in the menu to start.',
    examples: SERVICE_EXAMPLES,
  },
  {
    id: 'welcome',
    titleKey: 'tutorial.welcome.title',
    bodyKey: 'tutorial.welcome.body',
    title: 'Welcome to meta-sovereign',
    body: 'Your personal CRM and one inbox for all your messages. Your data stays on your device unless you connect your own server.',
  },
  {
    id: 'chat',
    target: 'chat',
    titleKey: 'tutorial.chat.title',
    bodyKey: 'tutorial.chat.body',
    title: 'Chat',
    body: 'Conversations from all your connected services, in one inbox.',
  },
  {
    id: 'contacts',
    target: 'contacts',
    titleKey: 'tutorial.contacts.title',
    bodyKey: 'tutorial.contacts.body',
    title: 'Contacts',
    body: 'Each person appears once, even if you talk on several services.',
  },
  {
    id: 'automation',
    target: 'automation',
    titleKey: 'tutorial.automation.title',
    bodyKey: 'tutorial.automation.body',
    title: 'Automation',
    body: 'Automatic replies: when a message matches a pattern, the app suggests or sends a prepared answer.',
  },
  {
    id: 'backup',
    target: 'backup',
    titleKey: 'tutorial.backup.title',
    bodyKey: 'tutorial.backup.body',
    title: 'Backup',
    body: 'Save an encrypted copy of your data. Only your passphrase can open it.',
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

// Element-anchored spotlight (issue #25 R-N9, R-N10). Given a rect
// {top,left,width,height} the component renders four dimming panes
// (top/right/bottom/left) and a transparent frame around the target so
// the highlighted control is the only thing the user sees lit.
//
// Rendered as static markup the spotlight is a single absolutely
// positioned `<div>` that the SSR test can introspect; in the browser
// the parent wraps it inside a `position: fixed` overlay.
export const TutorialSpotlight = ({ rect }) => {
  if (!rect) {
    return null;
  }
  const { top, left, width, height } = rect;
  return el('div', {
    className: 'tutorial-spotlight-frame',
    style: {
      position: 'absolute',
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      height: `${height}px`,
      pointerEvents: 'none',
    },
    'aria-hidden': 'true',
  });
};

// Read the bounding rect of the first `[data-tutorial-id="<id>"]` in
// the document. Returns `null` when the element is missing or when the
// DOM is unavailable (SSR, restricted browser).
export const findTutorialRect = (tutorialId, doc = globalThis.document) => {
  if (!tutorialId || !doc?.querySelector) {
    return null;
  }
  const target = doc.querySelector(`[data-tutorial-id="${tutorialId}"]`);
  if (!target?.getBoundingClientRect) {
    return null;
  }
  const r = target.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) {
    return null;
  }
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

// Hook flavor: re-reads the rect on resize/scroll so the spotlight
// follows its anchor while the user pans the page.
export const useTutorialRect = (tutorialId) => {
  const [rect, setRect] = useState(() => findTutorialRect(tutorialId));
  useEffect(() => {
    if (!tutorialId) {
      setRect(null);
      return undefined;
    }
    let raf = 0;
    const raF = globalThis.requestAnimationFrame ?? ((cb) => cb(0));
    const caF = globalThis.cancelAnimationFrame ?? (() => {});
    const update = () => {
      caF(raf);
      raf = raF(() => setRect(findTutorialRect(tutorialId)));
    };
    update();
    globalThis.addEventListener?.('resize', update);
    globalThis.addEventListener?.('scroll', update, true);
    return () => {
      caF(raf);
      globalThis.removeEventListener?.('resize', update);
      globalThis.removeEventListener?.('scroll', update, true);
    };
  }, [tutorialId]);
  return rect;
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
      el(
        'div',
        { key: 'meta', className: 'meta tutorial-progress' },
        t('tutorial.progress', { current: index + 1, total })
      ),
      el('h2', { key: 'h', id: `tutorial-step-${step.id}` }, step.title),
      el('p', { key: 'body', className: 'tutorial-body' }, step.body),
      step.examples?.length
        ? el(TutorialExamples, { key: 'examples', examples: step.examples })
        : null,
      el('div', { key: 'actions', className: 'row tutorial-actions' }, [
        el(
          'button',
          {
            key: 'off',
            type: 'button',
            className: 'tutorial-off',
            'data-action': 'tutorial-off',
            onClick: onDismiss,
          },
          t('tutorial.off')
        ),
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
      ]),
    ]
  );
};

// Row of brand names under a step ("For example: Telegram, Gmail, ...").
const TutorialExamples = ({ examples }) => {
  const t = useT();
  return el(
    'div',
    { className: 'tutorial-examples', 'data-tutorial-examples': '' },
    [
      el(
        'span',
        { key: 'label', className: 'meta' },
        t('tutorial.connect.examples')
      ),
      el(
        'ul',
        { key: 'list', className: 'tutorial-brands' },
        examples.map((name) => el('li', { key: name }, name))
      ),
      el(
        'span',
        { key: 'more', className: 'meta' },
        t('tutorial.connect.more')
      ),
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

  if (step.tutorialId) {
    return el(TutorialSpotlightOverlay, {
      step,
      index: safeIndex,
      total,
      onNext: advance,
      onSkip: skip,
      onDismiss: dismiss,
    });
  }

  return el(
    'div',
    {
      className: 'tutorial-overlay',
      role: 'presentation',
      'data-tutorial-overlay': '',
      'data-tutorial-target': '',
    },
    [
      el(Step, {
        key: 'step',
        step,
        index: safeIndex,
        total,
        onNext: advance,
        onSkip: skip,
        onDismiss: dismiss,
      }),
    ]
  );
};

// Spotlight variant of the overlay. The rect is lifted to this level so
// the dialog card can be placed *opposite* the highlighted control —
// anchoring at the top when the target sits in the bottom half (e.g. the
// mobile bottom-nav) and at the bottom otherwise. Without this, the
// dialog sat on top of the bottom-nav and intercepted the very tap the
// step is asking for.
const TutorialSpotlightOverlay = ({
  step,
  index,
  total,
  onNext,
  onSkip,
  onDismiss,
}) => {
  const rect = useTutorialRect(step.tutorialId);
  const viewportHeight =
    typeof globalThis.innerHeight === 'number' ? globalThis.innerHeight : 0;
  const targetCenter = rect ? rect.top + rect.height / 2 : 0;
  // Place the dialog at the top of the viewport when the spotlighted
  // control is in the lower half of the screen, so the card never
  // overlaps its own anchor (R-N9, R-N10).
  const side =
    rect && viewportHeight > 0 && targetCenter > viewportHeight / 2
      ? 'top'
      : 'bottom';
  return el(
    'div',
    {
      className: 'tutorial-overlay tutorial-overlay-spotlight',
      role: 'presentation',
      'data-tutorial-overlay': '',
      'data-tutorial-target': step.tutorialId ?? '',
      'data-spotlight-side': side,
    },
    [
      el(TutorialSpotlight, { key: 'spot', rect }),
      el(Step, {
        key: 'step',
        step,
        index,
        total,
        onNext,
        onSkip,
        onDismiss,
      }),
    ]
  );
};

export const TutorialButton = ({ onOpen }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: 'tutorial-toggle header-btn',
      'data-action': 'tutorial-open',
      'aria-label': t('header.tutorialAria'),
      title: t('header.tutorialAria'),
      onClick: onOpen,
    },
    [
      el(Icon, { key: 'i', name: 'help', size: 18 }),
      el('span', { key: 'l', className: 'btn-label' }, t('header.tutorial')),
    ]
  );
};
