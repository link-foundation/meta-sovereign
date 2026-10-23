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
//     (./tutorial-placement.js); the ring is tied to the target with
//     CSS anchor positioning and the card is placed once in the frame
//     the target scrolls in (./tutorial-follow.js), so both move with
//     it during a scroll without a frame of delay or a jump;
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
import { choosePlacement, GAP, MARGIN } from './tutorial-placement.js';
import {
  pageRectOf,
  targetFrame,
  useCardPlacement,
  useResettle,
} from './tutorial-follow.js';
import { parseConnectionHash } from './connections/hash.js';
import { startIndex } from './tutorial-start.js';

const el = React.createElement;

export const TUTORIAL_STORAGE_KEY = 'metaSovereignTutorial';
// The service the tour reopens (see rememberProvider below).
export const TUTORIAL_PROVIDER_KEY = 'metaSovereignTutorialProvider';

// Saved tutorial progress (which step, or "turned off") is stamped with
// this version. Bump it whenever the tour's steps or flow change, so a
// user whose saved progress predates the change is reset to the start of
// the new tour instead of resuming a step that no longer means the same
// thing (which is how a Telegram selection could resume onto Email).
// v3: the tour remembers the service the user picked.
export const TUTORIAL_VERSION = 5;

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
//
// `route` is the page a step lives on (`{ view, detail }`, detail: a
// provider page is open or not). Entering the step — Next, Back, or
// resuming after a reload, which always starts on Chat — opens that
// page, so a card never talks about a page that is not on screen.
// Steps that point at the navigation work on any page and have none.
// `completeAt` advances the tour when the app *arrives* at that place,
// whichever button got it there (and not when a click fails).
// `completeOnConnect` advances when any service finishes connecting,
// however the user did it, so the connect step clears once it is done.
// Sections that phones keep in the More sheet are reached through it.
const NAV_FALLBACKS = ['nav:more'];

export const defaultSteps = [
  {
    id: 'connect',
    connecting: true,
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
    // The whole Connections section — browser sign-ins and every
    // service — is lit and usable: we cannot know where the user will
    // click. Next opens Email (the setup step's route); opening any
    // service page gets there too (`completeAt`).
    id: 'pick',
    connecting: true,
    tutorialId: 'connections:list',
    route: { view: 'connections', detail: false },
    completeAt: { view: 'connections', detail: true },
    titleKey: 'tutorial.connections.title',
    bodyKey: 'tutorial.connections.body',
    title: 'Pick a service',
    body: 'Everything here works now: "Find sign-ins" (recommended, with a local server) checks which services your browsers are already signed in to. On any service, "Import with browser" (recommended) signs you in and imports its export, "Enter manually" takes API keys or a file. Next opens the service you picked last (Email at first).',
  },
  {
    // The whole provider page is lit and usable — Back, both tabs and
    // the open panel — whichever way the user chooses to connect.
    id: 'setup',
    connecting: true,
    tutorialId: 'connections:detail',
    // Any provider page; Email when none is open.
    route: { view: 'connections', detail: true },
    // A finished connection (session, phone login, bot token or API keys)
    // advances the tour — the user did the thing this step teaches.
    completeOnConnect: true,
    titleKey: 'tutorial.connectionDetail.title',
    bodyKey: 'tutorial.connectionDetail.body',
    title: 'Import or enter manually',
    body: 'On "Import with browser", press "Open browser" and sign in, start the data export there and the downloaded file is imported automatically. Prefer to do it yourself? Switch to "Enter manually".',
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
    body: 'Everyone you talk to, and your Telegram contacts, each person once even across services. Open Contacts.',
  },
  {
    // Writing to someone starts here: "Message" opens their chat, even
    // one with no messages yet. Skipped while there are no contacts.
    id: 'contacts-open',
    tutorialId: 'contacts:open-chat',
    route: { view: 'contacts' },
    action: true,
    optional: true,
    completeAt: { view: 'chat' },
    titleKey: 'tutorial.contactsOpen.title',
    bodyKey: 'tutorial.contactsOpen.body',
    title: 'Open a chat',
    body: 'Press "Message" next to a person to open your chat with them, even if you never wrote to them before. Search finds anyone by name or @username.',
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
    body: 'Conversations from all your connected services, in one inbox. Type below and press Send to reply; the line under the list shows the connected account and when it last synced; it syncs by itself.',
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
    body: 'Automatic replies: when a message matches a pattern, the app drafts an answer. Nothing is sent until you confirm it.',
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

export const clearPreference = (storage) => {
  try {
    storage?.removeItem?.(TUTORIAL_STORAGE_KEY);
    storage?.removeItem?.(TUTORIAL_PROVIDER_KEY);
  } catch {
    // See readPreference().
  }
};

export const readPreference = (storage) => {
  try {
    const raw = storage?.getItem?.(TUTORIAL_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const pref = JSON.parse(raw);
    // Saved by an earlier, different tour: its step may mean something
    // else now, so the progress is forgotten. "Turned off" or "finished"
    // stays as it was (R-M11): a new version never reopens the tour.
    if (pref?.v !== TUTORIAL_VERSION) {
      clearPreference(storage);
      if (!pref?.off) {
        return null;
      }
      const kept = {
        off: true,
        ...(pref.completed ? { completed: true } : {}),
      };
      writePreference(storage, { ...kept, at: pref.at ?? Date.now() });
      return { ...kept, at: pref.at ?? null, v: TUTORIAL_VERSION };
    }
    return pref;
  } catch {
    return null;
  }
};

export const writePreference = (storage, value) => {
  try {
    storage?.setItem?.(
      TUTORIAL_STORAGE_KEY,
      JSON.stringify({ ...value, v: TUTORIAL_VERSION })
    );
  } catch {
    // Storage can be disabled in restricted browser contexts.
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
// The ring sits this far outside the target (within the card's GAP).
const RING_OUTSET = 6;

export const TutorialSpotlight = ({
  rect,
  anchored = false,
  position = 'absolute',
}) => {
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
      position,
      top: `${top - RING_OUTSET}px`,
      left: `${left - RING_OUTSET}px`,
      width: `${width + 2 * RING_OUTSET}px`,
      height: `${height + 2 * RING_OUTSET}px`,
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
// `frame` is where it scrolls (see ./tutorial-follow.js) and `page` its
// rect in document coordinates, which a scroll of the page leaves alone.
const readTarget = (tutorialId, fallbacks) => {
  const element = findTutorialTarget(
    tutorialId,
    globalThis.document,
    fallbacks
  );
  const rect = rectOf(element);
  const frame = element ? targetFrame(element) : null;
  return {
    tutorialId,
    element,
    rect,
    frame,
    page: frame === 'page' ? pageRectOf(rect) : null,
  };
};

// Same place in its own frame: a page target is not re-rendered while
// the page scrolls (its card and ring scroll with it by themselves).
const sameTargetPlace = (a, b) =>
  a.element === b.element &&
  a.frame === b.frame &&
  (a.frame === 'page' ? sameRect(a.page, b.page) : sameRect(a.rect, b.rect));

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
          prev.tutorialId === tutorialId && sameTargetPlace(prev, next)
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

const useIsomorphicLayoutEffect =
  typeof globalThis.document === 'undefined' ? useEffect : useLayoutEffect;

// Marks the spotlighted control as the CSS anchor (`anchor-name` comes
// from the stylesheet) for as long as the step is shown. Returns
// whether ring and card can rely on anchor positioning.
export const useSpotlightAnchor = (element) => {
  const [anchored] = useState(supportsAnchorPositioning);
  const marked = useRef(null);
  // On every commit, before paint (the card's anchor() styles land in
  // the same commit). Not keyed on `element`: the target is read from
  // the page during render, and a render React throws away can record
  // a new element without running a keyed effect for it (seen in
  // WebKit), which left the card at the corner of the screen.
  useIsomorphicLayoutEffect(() => {
    const target = anchored ? element : null;
    if (marked.current !== target) {
      marked.current?.removeAttribute(SPOTLIGHT_ANCHOR_ATTR);
      target?.setAttribute(SPOTLIGHT_ANCHOR_ATTR, '');
      marked.current = target;
    }
  });
  useEffect(
    () => () => marked.current?.removeAttribute(SPOTLIGHT_ANCHOR_ATTR),
    []
  );
  return anchored;
};

// Latest-value ref, so long-lived listeners call current callbacks.
const useLatest = (value) => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};

// A click on `selector` anywhere in the app (outside the card) moves
// the tour on — after the app has handled the click itself.
// Where the app is: the view in <main data-view> and the provider page
// from the `#conn-<id>` hash (only meaningful on Connections).
export const readPlace = (doc = globalThis.document) => {
  const hash = globalThis.location?.hash ?? '';
  return {
    view:
      doc?.querySelector?.('main[data-view]')?.getAttribute('data-view') ??
      null,
    provider: parseConnectionHash(hash).provider,
  };
};

export const placeMatches = (route, place) =>
  !route ||
  (place.view === route.view &&
    (route.detail === undefined || Boolean(place.provider) === route.detail));

// The service (and tab) the user last opened during the tour, as the
// `#conn-` hash tail: `telegram/manual`. When the tour has to reopen a
// provider page (Back then Next, "Show me", a reload on the list) it
// returns to *their* choice — never swaps Telegram for Email.
const PROVIDER_ID = /^[a-z0-9-]{1,40}(\/manual)?$/;

export const rememberProvider = (
  provider,
  storage = globalThis.localStorage
) => {
  if (!provider || !PROVIDER_ID.test(provider)) {
    return;
  }
  try {
    storage?.setItem(TUTORIAL_PROVIDER_KEY, provider);
  } catch {
    // Restricted storage: the tour falls back to Email.
  }
};

export const rememberedProvider = (storage = globalThis.localStorage) => {
  try {
    const provider = storage?.getItem(TUTORIAL_PROVIDER_KEY);
    return provider && PROVIDER_ID.test(provider) ? provider : null;
  } catch {
    return null;
  }
};

/** The `meta-sovereign:navigate` detail that takes the app to `route`. */
export const navigationFor = (route, place, remembered = null) => {
  const detail = { view: route.view };
  if (route.detail === false) {
    // Back to the list (also clears a stale provider hash).
    detail.anchor = '';
  } else if (route.detail === true && !place.provider) {
    detail.anchor = `#conn-${route.provider ?? remembered ?? 'email'}`;
  }
  return detail;
};

const goToRoute = (route) => {
  globalThis.dispatchEvent?.(
    new CustomEvent('meta-sovereign:navigate', {
      detail: navigationFor(route, readPlace(), rememberedProvider()),
    })
  );
};

const samePlace = (a, b) => a.view === b.view && a.provider === b.provider;

// The current place, kept up to date as views and hashes change.
const usePlace = () => {
  const [place, setPlace] = useState(readPlace);
  useEffect(() => {
    const update = () =>
      setPlace((prev) => {
        const next = readPlace();
        if (next.provider) {
          rememberProvider(globalThis.location?.hash?.slice('#conn-'.length));
        }
        return samePlace(prev, next) ? prev : next;
      });
    globalThis.addEventListener?.('hashchange', update);
    const Observer = globalThis.MutationObserver;
    const observer = Observer ? new Observer(update) : null;
    const body = globalThis.document?.body;
    if (observer && body) {
      observer.observe(body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-view'],
      });
    }
    update();
    return () => {
      globalThis.removeEventListener?.('hashchange', update);
      observer?.disconnect();
    };
  }, []);
  return place;
};

// Open the step's page when the step starts (and on resume). Deferred
// one task: on a fresh load this effect runs before the app shell has
// subscribed to navigation (child effects run before parent ones), and
// an event sent now would be lost.
const useStepRoute = (step) => {
  useEffect(() => {
    if (!step.route) {
      return undefined;
    }
    const timer = globalThis.setTimeout(() => {
      if (!placeMatches(step.route, readPlace())) {
        goToRoute(step.route);
      }
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [step.id]);
};

// Advance when the app arrives at `completeAt` during this step. Being
// there already when the step starts (Back from a provider page) does
// not count: only a change into it does.
const useCompleteAt = (step, place, onAdvance) => {
  const done = Boolean(step.completeAt) && placeMatches(step.completeAt, place);
  const seen = useRef({ id: null, done: false });
  const latest = useLatest(onAdvance);
  useEffect(() => {
    if (seen.current.id !== step.id) {
      seen.current = { id: step.id, done };
      return;
    }
    const arrived = done && !seen.current.done;
    seen.current.done = done;
    if (arrived) {
      latest.current();
    }
  }, [step.id, done]);
};

/**
 * The step's page: opened when the step starts, `completeAt` watched.
 * When the user went elsewhere mid-step (`offPage`) the tour does not
 * drag them back; "Next" becomes "Show me" and takes them there.
 */
const useStepPage = (step, { onNext, onAdvance }) => {
  const place = usePlace();
  useStepRoute(step);
  useCompleteAt(step, place, onAdvance);
  const offPage = Boolean(step.route) && !placeMatches(step.route, place);
  return { offPage, next: offPage ? () => goToRoute(step.route) : onNext };
};

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

// A service connected while the tour sat on its "connect" step: advance,
// whichever way the user connected (a saved session, a phone login, a bot
// token or API keys all dispatch `meta-sovereign:connected`). The listener
// lives only while the step is active, so it cannot advance a later step.
const useCompleteOnConnect = (active, onAdvance) => {
  const latest = useLatest(onAdvance);
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const onConnected = () => globalThis.setTimeout(() => latest.current(), 0);
    globalThis.addEventListener?.('meta-sovereign:connected', onConnected);
    return () =>
      globalThis.removeEventListener?.('meta-sovereign:connected', onConnected);
  }, [active]);
};

const prefersReducedMotion = () =>
  Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

// Bring the target into view once per step. `nearest` is a no-op for a
// fully visible target and otherwise scrolls every clipping container
// (the nav drawer, the page) just enough — a target can be inside the
// viewport yet clipped by its own scroll container.
// Fully on screen. A target too tall to share the screen with the card
// (the grid of services) counts when its top sits `room` below the top
// of the screen — the card goes in that room, above it, never over it.
const tooTall = (r, room) => r.height > (globalThis.innerHeight ?? 0) - room;

const inView = (element, room) => {
  const r = element.getBoundingClientRect();
  const height = globalThis.innerHeight ?? 0;
  const width = globalThis.innerWidth ?? 0;
  const across = r.left >= 0 && r.right <= width;
  return tooTall(r, room)
    ? across && r.top >= room - 1 && r.top <= Math.max(room, height / 2)
    : across && r.top >= 0 && r.bottom <= height;
};

const REVEAL_RETRY_MS = 500;
const REVEAL_TRIES = 3;

// Bring the target into view when the step (or its element) appears.
// A smooth scroll can be cut short when the page re-renders under it
// (a provider page replacing the list), so it is checked again and
// finished instantly — at most three times, and never once the target
// is on screen, so the user's own scrolling is left alone. `room` is
// the card's height plus its gap: a tall target scrolls its top there.
const useRevealTarget = (stepId, element, room = 0) => {
  // Checked on every commit rather than keyed on `element` (see
  // useSpotlightAnchor): a new step, element or room starts a reveal.
  const last = useRef({ stepId: null, element: null, room: null, timer: 0 });
  useEffect(() => {
    const seen = last.current;
    if (
      seen.stepId === stepId &&
      seen.element === element &&
      seen.room === room
    ) {
      return;
    }
    globalThis.clearTimeout(seen.timer);
    last.current = { stepId, element, room, timer: 0 };
    if (!element) {
      return;
    }
    let tries = 0;
    const reveal = () => {
      if (!element.isConnected || inView(element, room)) {
        return;
      }
      const behavior =
        tries === 0 && !prefersReducedMotion() ? 'smooth' : 'auto';
      const r = element.getBoundingClientRect();
      if (tooTall(r, room)) {
        globalThis.scrollBy?.({ top: r.top - room, behavior });
      } else {
        element.scrollIntoView?.({
          block: 'nearest',
          inline: 'nearest',
          behavior,
        });
      }
      tries += 1;
      if (tries < REVEAL_TRIES) {
        last.current.timer = globalThis.setTimeout(reveal, REVEAL_RETRY_MS);
      }
    };
    reveal();
  });
  useEffect(() => () => globalThis.clearTimeout(last.current.timer), []);
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
  onAdvance,
  onBack,
  onDismiss,
  offPage = false,
  cardRef,
  modal,
  style,
  side,
  follow,
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
      'data-follow': follow,
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
      el('div', { key: 'meta', className: 'meta tutorial-progress' }, [
        el(
          'span',
          { key: 'n' },
          t('tutorial.progress', { current: index + 1, total })
        ),
        // Each step can be passed over on its own (R-M10, R-N3); the same
        // forward move as Next, so the progress is kept the same way. It
        // sits beside the step count so the buttons keep one row.
        index + 1 < total
          ? el(
              'button',
              {
                key: 'skip',
                type: 'button',
                className: 'tutorial-skip',
                'data-action': 'tutorial-skip',
                onClick: onAdvance,
              },
              t('tutorial.skip')
            )
          : null,
      ]),
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
          offPage
            ? t('tutorial.showMe')
            : index + 1 === total
              ? t('tutorial.finish')
              : t('tutorial.next')
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

// The part of the screen a card may use: above the phone's bottom
// navigation, so the card never hides the way to another section.
const bottomNavHeight = () => {
  const nav = globalThis.document?.querySelector?.('.bottom-nav');
  const r = nav?.getBoundingClientRect?.();
  return r && r.height > 0
    ? Math.max(0, (globalThis.innerHeight ?? 0) - r.top)
    : 0;
};

const viewportSize = () => ({
  width: globalThis.innerWidth ?? 1024,
  height: (globalThis.innerHeight ?? 768) - bottomNavHeight(),
});

const GLIDE = 'top 240ms ease, left 240ms ease';

// The card's style: hidden while it is measured or waits for its
// target, centred without one, otherwise placed in the frame its target
// scrolls in (./tutorial-follow.js).
const cardLayout = ({ placed, cardSize, waiting }) => {
  if (!cardSize || waiting) {
    return { side: 'pending', style: { visibility: 'hidden' } };
  }
  if (!placed) {
    const center = choosePlacement({
      target: null,
      card: cardSize,
      viewport: viewportSize(),
    });
    return {
      side: center.side,
      style: { top: `${center.top}px`, left: `${center.left}px` },
    };
  }
  const { side, arrow, mode } = placed;
  const style = placed.animate
    ? { ...placed.style, transition: GLIDE }
    : placed.style;
  if (arrow === null || side === 'center' || side === 'dock') {
    return { side, mode, style };
  }
  const vertical = side === 'left' || side === 'right';
  return {
    side,
    mode,
    style,
    arrowStyle: vertical
      ? { top: `${arrow - 7}px` }
      : { left: `${arrow - 7}px` },
  };
};

// The ring: for a target on the page, in document coordinates next to
// the card, so both scroll with the page in the same frame; for one in
// a fixed bar (the navigation drawer scrolls on its own), tied to it by
// CSS anchors where the browser has them, else on the screen.
const ringPlace = (tracked, anchored, overlay) => {
  if (tracked.frame === 'page' && tracked.page && overlay) {
    const o = overlay.getBoundingClientRect();
    const origin = pageRectOf({ top: o.top, left: o.left });
    return {
      rect: {
        ...tracked.page,
        top: tracked.page.top - origin.top,
        left: tracked.page.left - origin.left,
      },
      position: 'absolute',
    };
  }
  return anchored
    ? { rect: tracked.rect, anchored }
    : { rect: tracked.rect, position: 'fixed' };
};

// A card docked at the bottom of the screen covers the end of a long
// page: the page grows by the card's height while it is there, so the
// user can still scroll every part of the target clear of it.
const dockSpace = (layout, cardSize) =>
  layout.side === 'dock' && cardSize && parseFloat(layout.style.top) > MARGIN
    ? Math.ceil(cardSize.height + 2 * MARGIN)
    : 0;

const DOCK_SPACE_VAR = '--tutorial-dock-space';

const useDockSpace = (space) => {
  useIsomorphicLayoutEffect(() => {
    const root = globalThis.document?.documentElement;
    if (!root || !space) {
      return undefined;
    }
    root.style.setProperty(DOCK_SPACE_VAR, `${space}px`);
    return () => root.style.removeProperty(DOCK_SPACE_VAR);
  }, [space]);
};

const overlayProps = ({ step, element, spotlight, waiting }) => ({
  className: spotlight
    ? 'tutorial-overlay tutorial-overlay-spotlight'
    : `tutorial-overlay tutorial-overlay-centered${waiting ? ' tutorial-overlay-waiting' : ''}`,
  role: 'presentation',
  'data-tutorial-overlay': '',
  'data-tutorial-target': spotlight
    ? (element.getAttribute?.('data-tutorial-id') ?? step.tutorialId)
    : '',
});

// The card's measured size, kept up to date while it is on screen.
const useCardSize = (cardRef, stepId) => {
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
  }, [stepId]);
  return cardSize;
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
  onSkip,
}) => {
  const tracked = useTutorialTarget(step.tutorialId, step.fallbacks);
  const { element, rect } = tracked;
  const anchored = useSpotlightAnchor(element);
  const expired = useTargetDeadline(step.id, Boolean(step.tutorialId));
  const { offPage, next } = useStepPage(step, { onNext, onAdvance });
  const skip = Boolean(step.optional && expired && !rect && !offPage);
  useEffect(() => {
    if (skip) {
      onSkip?.();
    }
  }, [skip]);
  const cardRef = useRef(null);
  const overlayRef = useRef(null);
  const cardSize = useCardSize(cardRef, step.id);
  const version = useResettle({ cardRef, element, viewportOf: viewportSize });

  useAdvanceOn(step.advanceOn, onAdvance);
  useCompleteOnConnect(Boolean(step.completeOnConnect), onAdvance);
  useRevealTarget(
    step.id,
    element,
    cardSize ? cardSize.height + GAP + MARGIN : 0
  );
  useTourKeys(cardRef, { onNext: next, onBack, onDismiss });

  const spotlight = Boolean(rect);
  const waiting =
    Boolean(step.tutorialId) && !rect && (!expired || step.optional);
  const placed = useCardPlacement({
    stepId: step.id,
    target: spotlight ? tracked : null,
    cardSize: waiting ? null : cardSize,
    viewport: viewportSize(),
    overlayRef,
    version,
  });
  const layout = cardLayout({ placed, cardSize, waiting });
  useDialogFocus(cardRef, step.id, layout.side !== 'pending');
  useDockSpace(dockSpace(layout, cardSize));
  return el(
    'div',
    {
      ref: overlayRef,
      ...overlayProps({ step, element, spotlight, waiting }),
      'data-spotlight-side': layout.side,
    },
    [
      spotlight
        ? el(TutorialSpotlight, {
            key: 'spot',
            ...ringPlace(tracked, anchored, overlayRef.current),
          })
        : null,
      el(Step, {
        key: 'step',
        step,
        index,
        total,
        onNext: next,
        onAdvance,
        offPage,
        onBack,
        onDismiss,
        cardRef,
        modal: !spotlight,
        style: layout.style,
        side: layout.side,
        follow: layout.mode,
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
  connected = null,
}) => {
  const t = useT();
  const localized = localizeSteps(t, steps);
  const firstIndex = () =>
    startIndex(localized, readProgressIndex(storage, localized), connected);
  const [index, setIndex] = useState(firstIndex);
  const total = localized.length;
  // Which way the user is going, so a skipped step keeps that direction.
  const direction = useRef(1);

  // Pick up persisted progress after a page load or explicit reopen.
  // We key this effect on `steps` (the source list, identity-stable
  // across renders) rather than the freshly-localized array so the
  // effect doesn't re-fire on every locale change.
  useEffect(() => {
    if (open) {
      setIndex(firstIndex());
    }
  }, [open, steps, storage, connected]);

  if (!open || readPreference(storage)?.off) {
    return null;
  }
  const safeIndex = index >= 0 && index < total ? index : 0;
  const step = localized[safeIndex];
  if (!step) {
    return null;
  }

  const goTo = (nextIndex) => {
    direction.current = nextIndex < safeIndex ? -1 : 1;
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
    // A click that `advanceOn` recognises, or the arrival at
    // `completeAt` it causes, moves the tour by itself.
    const selfAdvancing = step.completeAt
      ? true
      : Boolean(step.advanceOn && target?.closest?.(step.advanceOn));
    if (!target || !selfAdvancing) {
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

  // An optional step whose target never appeared (no local server for
  // the browser sign-ins panel) is passed over in the current direction.
  const skip = () =>
    direction.current < 0 && safeIndex > 0 ? goTo(safeIndex - 1) : advance();

  return el(TutorialLayer, {
    key: 'layer',
    step,
    index: safeIndex,
    total,
    onNext: next,
    onAdvance: advance,
    onBack: back,
    onDismiss: dismiss,
    onSkip: skip,
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
