// Tutorial overlay for the SPA (issue #10).
//
// Headline goals (R-M9 .. R-M12):
//   - walk a brand-new user through the key flows step by step
//   - go back, skip ahead, or turn the tutorial off (preference persists)
//   - re-open the tutorial later from a header button
//
// How it behaves (the shared practice of Shepherd, Driver.js, Joyride
// and Intro.js):
//   - action steps advance when the user does the thing they describe:
//     clicking the highlighted control moves the tour on, and "Next"
//     on such a step performs that click, so the app and the tour never
//     disagree about where the user is;
//   - the card sits beside its target with an arrow and never covers it
//     (./tutorial-placement.js); ring and card are tied to the target
//     with CSS anchor positioning so they move with it during a scroll;
//   - the target is scrolled into view, and a step whose target is not
//     on screen falls back to a centred card;
//   - the card is a labelled dialog that takes focus, Esc closes the
//     tour, ← / → step through it, and focus returns where it was.
//
// The component is intentionally small so it can ship under the same
// Unlicense as the rest of the repo without pulling in an MIT or AGPL
// tour library. See docs/case-studies/issue-10/external-research.md
// section 3 for the licensing analysis.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { anchoredCardStyle, choosePlacement } from './tutorial-placement.js';

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

// `tutorialId` names the `data-tutorial-id` the step points at; a step
// without one is a centred card. `advanceOn` is a selector: a click on
// a matching element moves the tour to the next step. `action` steps
// describe a click, so "Next" performs it (on `actionTarget`, or the
// target itself) instead of just skipping ahead.
// Sections that phones keep in the More sheet are reached through it.
const NAV_FALLBACKS = ['nav:more'];

export const defaultSteps = [
  {
    id: 'connect',
    target: 'connections',
    tutorialId: 'nav:connections',
    advanceOn: '[data-tutorial-id="nav:connections"]',
    action: true,
    titleKey: 'tutorial.connect.title',
    bodyKey: 'tutorial.connect.body',
    title: 'Connect your first service',
    body: 'Bring your chats and contacts into one place. Open Connections to start.',
    examples: SERVICE_EXAMPLES,
  },
  {
    id: 'pick',
    tutorialId: 'connections:telegram',
    advanceOn: '[data-action="open-connection-detail"]',
    action: true,
    actionTarget:
      '[data-tutorial-id="connections:telegram"] [data-action="open-connection-detail"]',
    titleKey: 'tutorial.connections.title',
    bodyKey: 'tutorial.connections.body',
    title: 'Pick a service',
    body: 'Each card is one service. Press "Set up" on the one you use most.',
  },
  {
    id: 'setup',
    tutorialId: 'auto-import',
    titleKey: 'tutorial.connectionDetail.title',
    bodyKey: 'tutorial.connectionDetail.body',
    title: 'Import with a browser',
    body: 'Press "Open browser" and sign in. Start the data export there and the downloaded file is imported automatically.',
  },
  {
    id: 'chat',
    target: 'chat',
    tutorialId: 'nav:chat',
    fallbacks: NAV_FALLBACKS,
    advanceOn: '[data-tutorial-id="nav:chat"]',
    titleKey: 'tutorial.chat.title',
    bodyKey: 'tutorial.chat.body',
    title: 'Chat',
    body: 'Conversations from all your connected services, in one inbox.',
  },
  {
    id: 'contacts',
    target: 'contacts',
    tutorialId: 'nav:contacts',
    fallbacks: NAV_FALLBACKS,
    advanceOn: '[data-tutorial-id="nav:contacts"]',
    titleKey: 'tutorial.contacts.title',
    bodyKey: 'tutorial.contacts.body',
    title: 'Contacts',
    body: 'Each person appears once, even if you talk on several services.',
  },
  {
    id: 'automation',
    target: 'automation',
    tutorialId: 'nav:automation',
    fallbacks: NAV_FALLBACKS,
    advanceOn: '[data-tutorial-id="nav:automation"]',
    titleKey: 'tutorial.automation.title',
    bodyKey: 'tutorial.automation.body',
    title: 'Automation',
    body: 'Automatic replies: when a message matches a pattern, the app suggests or sends a prepared answer.',
  },
  {
    id: 'backup',
    target: 'backup',
    tutorialId: 'nav:backup',
    fallbacks: NAV_FALLBACKS,
    advanceOn: '[data-tutorial-id="nav:backup"]',
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
//
// With `anchored` the frame is tied to the target through CSS anchor
// positioning (see `useSpotlightAnchor`), so the browser moves it in
// the same frame as a scroll. Coordinates copied from JS only catch up
// one frame later, which reads as the outline trailing the control.
export const TutorialSpotlight = ({ rect, anchored = false }) => {
  if (!rect) {
    return null;
  }
  if (anchored) {
    return el('div', {
      className: 'tutorial-spotlight-frame tutorial-spotlight-anchored',
      'aria-hidden': 'true',
    });
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

const isRendered = (element) => {
  const r = element.getBoundingClientRect?.();
  return Boolean(r && (r.width > 0 || r.height > 0));
};

// Visible element for a `data-tutorial-id`, or for the first visible
// fallback id (`step.fallbacks`): on phones the Backup button lives in
// the closed More sheet, so the step points at "More" until it opens.
export const findTutorialTarget = (
  tutorialId,
  doc = globalThis.document,
  fallbacks = []
) => {
  if (!tutorialId || !doc?.querySelectorAll) {
    return null;
  }
  for (const id of [tutorialId, ...fallbacks]) {
    const candidates = doc.querySelectorAll(`[data-tutorial-id="${id}"]`);
    const visible = [...candidates].find(isRendered);
    if (visible) {
      return visible;
    }
  }
  return null;
};

const rectOf = (element) => {
  const r = element?.getBoundingClientRect?.();
  return r
    ? { top: r.top, left: r.left, width: r.width, height: r.height }
    : null;
};

// Read the bounding rect of the visible `[data-tutorial-id="<id>"]`.
// Returns `null` when the element is missing or when the DOM is
// unavailable (SSR, restricted browser).
export const findTutorialRect = (tutorialId, doc = globalThis.document) =>
  rectOf(findTutorialTarget(tutorialId, doc));

const sameRect = (a, b) =>
  a === b ||
  (a &&
    b &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5);

// Tracks the step's target while the app changes around it: scrolling,
// resizing, and views mounting after a navigation (the next step's
// target usually appears a moment after the click that advanced to it).
const readTarget = (tutorialId, fallbacks) => {
  const element = findTutorialTarget(
    tutorialId,
    globalThis.document,
    fallbacks
  );
  return { tutorialId, element, rect: rectOf(element) };
};

const NO_FALLBACKS = [];

export const useTutorialTarget = (tutorialId, fallbacks = NO_FALLBACKS) => {
  const [tracked, setState] = useState(() => readTarget(tutorialId, fallbacks));
  // Right after a step change the tracked target still belongs to the
  // previous step; read the new one instead of flashing at the old.
  const state =
    tracked.tutorialId === tutorialId
      ? tracked
      : readTarget(tutorialId, fallbacks);
  useEffect(() => {
    let raf = 0;
    const raF = globalThis.requestAnimationFrame ?? ((cb) => cb(0));
    const caF = globalThis.cancelAnimationFrame ?? (() => {});
    const update = () => {
      caF(raf);
      raf = raF(() => {
        const next = readTarget(tutorialId, fallbacks);
        setState((prev) =>
          prev.tutorialId === tutorialId &&
          prev.element === next.element &&
          sameRect(prev.rect, next.rect)
            ? prev
            : next
        );
      });
    };
    update();
    globalThis.addEventListener?.('resize', update);
    globalThis.addEventListener?.('scroll', update, true);
    const Observer = globalThis.MutationObserver;
    const observer =
      Observer && globalThis.document?.body ? new Observer(update) : null;
    observer?.observe(globalThis.document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'class'],
    });
    return () => {
      caF(raf);
      observer?.disconnect();
      globalThis.removeEventListener?.('resize', update);
      globalThis.removeEventListener?.('scroll', update, true);
    };
  }, [tutorialId, fallbacks]);
  return state;
};

// Kept for callers that only need the rect.
export const useTutorialRect = (tutorialId) =>
  useTutorialTarget(tutorialId).rect;

export const SPOTLIGHT_ANCHOR_ATTR = 'data-tutorial-anchor';

const supportsAnchorPositioning = () =>
  Boolean(globalThis.CSS?.supports?.('anchor-name: --tutorial-target'));

// Marks the spotlighted control as the CSS anchor (`anchor-name` comes
// from the stylesheet) for as long as the step is shown. Returns
// whether ring and card can rely on anchor positioning.
export const useSpotlightAnchor = (element) => {
  const [anchored] = useState(supportsAnchorPositioning);
  useEffect(() => {
    const target = anchored ? element : null;
    target?.setAttribute(SPOTLIGHT_ANCHOR_ATTR, '');
    return () => target?.removeAttribute(SPOTLIGHT_ANCHOR_ATTR);
  }, [anchored, element]);
  return anchored;
};

const useIsomorphicLayoutEffect =
  typeof globalThis.document === 'undefined' ? useEffect : useLayoutEffect;

// Latest-value ref, so long-lived listeners call current callbacks.
const useLatest = (value) => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};

// A click on `selector` anywhere in the app (outside the card) moves
// the tour on — after the app has handled the click itself.
const useAdvanceOn = (selector, onAdvance) => {
  const latest = useLatest(onAdvance);
  useEffect(() => {
    const doc = globalThis.document;
    if (!selector || !doc) {
      return undefined;
    }
    const onClick = (event) => {
      const hit = event.target?.closest?.(selector);
      if (hit && !hit.closest('.tutorial-step')) {
        globalThis.setTimeout(() => latest.current(), 0);
      }
    };
    doc.addEventListener('click', onClick, true);
    return () => doc.removeEventListener('click', onClick, true);
  }, [selector]);
};

const prefersReducedMotion = () =>
  Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

// Bring the target into view once per step. `nearest` is a no-op for a
// fully visible target and otherwise scrolls every clipping container
// (the nav drawer, the page) just enough — a target can be inside the
// viewport yet clipped by its own scroll container.
const useRevealTarget = (stepId, element) => {
  const revealed = useRef(null);
  useEffect(() => {
    if (!element || revealed.current === stepId) {
      return;
    }
    revealed.current = stepId;
    element.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [stepId, element]);
};

// Focus moves to the card on every step (screen readers announce the
// dialog) and back to where it was when the tour closes. A hidden card
// (still waiting for its target) cannot take focus, so this waits for
// it to become visible.
// Focus follows the tour once the user is in it. When the tour opens
// by itself on page load (nothing focused yet), the first step leaves
// focus alone so the skip link stays the first Tab stop.
const useDialogFocus = (cardRef, stepId, visible) => {
  const doc = globalThis.document;
  const opened = useRef(null);
  if (opened.current === null) {
    const active = doc?.activeElement;
    opened.current = {
      previous: active,
      quietStep: !active || active === doc?.body ? stepId : null,
    };
  }
  useEffect(
    () => () => opened.current.previous?.focus?.({ preventScroll: true }),
    []
  );
  useEffect(() => {
    if (!visible || stepId === opened.current.quietStep) {
      return;
    }
    opened.current.quietStep = null;
    cardRef.current?.focus?.({ preventScroll: true });
  }, [stepId, visible]);
};

const useTourKeys = (cardRef, { onNext, onBack, onDismiss }) => {
  const latest = useLatest({ onNext, onBack, onDismiss });
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        latest.current.onDismiss();
        return;
      }
      if (!cardRef.current?.contains(globalThis.document?.activeElement)) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        latest.current.onNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        latest.current.onBack();
      }
    };
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, []);
};

// How long a step waits for its target (it usually mounts right after
// the click that advanced the tour) before falling back to a centred
// card.
export const TARGET_WAIT_MS = 700;

const useTargetDeadline = (stepId, hasTarget) => {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (!hasTarget) {
      return undefined;
    }
    const timer = globalThis.setTimeout(() => setExpired(true), TARGET_WAIT_MS);
    return () => globalThis.clearTimeout(timer);
  }, [stepId, hasTarget]);
  return expired;
};

const Step = ({
  step,
  index,
  total,
  onNext,
  onBack,
  onDismiss,
  cardRef,
  modal,
  style,
  side,
  arrowStyle,
}) => {
  const t = useT();
  const titleId = `tutorial-step-${step.id}`;
  return el(
    'section',
    {
      ref: cardRef,
      className: 'tutorial-step card',
      role: 'dialog',
      'aria-modal': modal ? 'true' : 'false',
      'aria-labelledby': titleId,
      'aria-describedby': `${titleId}-body`,
      'data-tutorial-step': step.id,
      'data-side': side,
      tabIndex: -1,
      style,
    },
    [
      arrowStyle
        ? el('span', {
            key: 'arrow',
            className: 'tutorial-arrow',
            'aria-hidden': 'true',
            style: arrowStyle,
          })
        : null,
      el(
        'div',
        { key: 'meta', className: 'meta tutorial-progress' },
        t('tutorial.progress', { current: index + 1, total })
      ),
      el('h2', { key: 'h', id: titleId }, step.title),
      el(
        'p',
        { key: 'body', id: `${titleId}-body`, className: 'tutorial-body' },
        step.body
      ),
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
        index > 0
          ? el(
              'button',
              {
                key: 'back',
                type: 'button',
                'data-action': 'tutorial-back',
                onClick: onBack,
              },
              t('tutorial.back')
            )
          : null,
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

const viewportSize = () => ({
  width: globalThis.innerWidth ?? 1024,
  height: globalThis.innerHeight ?? 768,
});

// Card coordinates: CSS anchor expressions when the browser can keep
// the card attached to the target by itself, pixels otherwise.
const cardLayout = ({ rect, cardSize, anchored, waiting }) => {
  if (!cardSize || waiting) {
    return { side: 'pending', style: { visibility: 'hidden' } };
  }
  const placement = choosePlacement({
    target: rect,
    card: cardSize,
    viewport: viewportSize(),
  });
  const { side } = placement;
  const sided = side !== 'center' && side !== 'dock';
  if (!sided) {
    return {
      side,
      style: { top: `${placement.top}px`, left: `${placement.left}px` },
    };
  }
  // The arrow's offset along the card edge only changes when the card
  // is clamped against the viewport, so the JS value is exact even
  // while the anchored card moves with a scroll.
  const vertical = side === 'left' || side === 'right';
  return {
    side,
    style: anchored
      ? anchoredCardStyle(side, cardSize)
      : { top: `${placement.top}px`, left: `${placement.left}px` },
    arrowStyle: vertical
      ? { top: `${placement.arrow - 7}px` }
      : { left: `${placement.arrow - 7}px` },
  };
};

// One layer for every step: ring + card when the target is on screen,
// a centred modal card when it is not.
const TutorialLayer = ({
  step,
  index,
  total,
  onNext,
  onAdvance,
  onBack,
  onDismiss,
}) => {
  const { element, rect } = useTutorialTarget(step.tutorialId, step.fallbacks);
  const anchored = useSpotlightAnchor(element);
  const expired = useTargetDeadline(step.id, Boolean(step.tutorialId));
  const cardRef = useRef(null);
  const [cardSize, setCardSize] = useState(null);

  useIsomorphicLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) {
      return undefined;
    }
    const measure = () =>
      setCardSize((prev) => {
        const next = { width: card.offsetWidth, height: card.offsetHeight };
        return prev && prev.width === next.width && prev.height === next.height
          ? prev
          : next;
      });
    measure();
    const Observer = globalThis.ResizeObserver;
    const observer = Observer ? new Observer(measure) : null;
    observer?.observe(card);
    return () => observer?.disconnect();
  }, [step.id]);

  useAdvanceOn(step.advanceOn, onAdvance);
  useRevealTarget(step.id, element);
  useTourKeys(cardRef, { onNext, onBack, onDismiss });

  const spotlight = Boolean(rect);
  const waiting = Boolean(step.tutorialId) && !rect && !expired;
  const layout = cardLayout({
    rect,
    cardSize,
    anchored: anchored && spotlight,
    waiting,
  });
  useDialogFocus(cardRef, step.id, layout.side !== 'pending');
  return el(
    'div',
    {
      className: spotlight
        ? 'tutorial-overlay tutorial-overlay-spotlight'
        : `tutorial-overlay tutorial-overlay-centered${waiting ? ' tutorial-overlay-waiting' : ''}`,
      role: 'presentation',
      'data-tutorial-overlay': '',
      'data-tutorial-target': spotlight
        ? (element.getAttribute?.('data-tutorial-id') ?? step.tutorialId)
        : '',
      'data-spotlight-side': layout.side,
    },
    [
      spotlight ? el(TutorialSpotlight, { key: 'spot', rect, anchored }) : null,
      el(Step, {
        key: 'step',
        step,
        index,
        total,
        onNext,
        onBack,
        onDismiss,
        cardRef,
        modal: !spotlight,
        style: layout.style,
        side: layout.side,
        arrowStyle: layout.arrowStyle,
      }),
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

  const goTo = (nextIndex) => {
    setIndex(nextIndex);
    writeProgressPreference(storage, steps[nextIndex]);
  };
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
    goTo(safeIndex + 1);
  };
  // "Next" on an action step does what the step asks (the click then
  // advances the tour through `advanceOn`), so the app follows along.
  const next = () => {
    const target = step.action
      ? step.actionTarget
        ? globalThis.document?.querySelector(step.actionTarget)
        : findTutorialTarget(step.tutorialId)
      : null;
    target?.click();
    // A click that `advanceOn` recognises moves the tour by itself.
    if (!target || !step.advanceOn || !target.closest?.(step.advanceOn)) {
      advance();
    }
  };
  const back = () => {
    if (safeIndex > 0) {
      goTo(safeIndex - 1);
    }
  };
  const dismiss = () => {
    if (onDismiss) {
      onDismiss();
    } else {
      writePreference(storage, { off: true, at: Date.now() });
    }
    setIndex(0);
    onClose?.();
  };

  return el(TutorialLayer, {
    key: 'layer',
    step,
    index: safeIndex,
    total,
    onNext: next,
    onAdvance: advance,
    onBack: back,
    onDismiss: dismiss,
  });
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
