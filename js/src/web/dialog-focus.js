// One focus rule for every modal dialog (R-Z12). Dialogs are built in many
// modules; each already closes on Escape (useEsc or its own handler), but none
// moved focus. This watches the page for `[role=dialog][aria-modal=true]`:
// when one opens, focus goes to its first control (unless a control inside
// already has it); Tab and Shift+Tab stay inside the newest one; when it
// closes, focus returns to what opened it.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
const OPENER =
  'button,a[href],input,select,textarea,[role="button"],[tabindex]';
const MODAL = '[role="dialog"][aria-modal="true"]';

const visible = (node) =>
  !node.hidden &&
  !node.closest('[hidden],[inert]') &&
  node.getClientRects().length > 0;

/** The controls inside `dialog` that Tab can reach, in order. */
export const focusablesIn = (dialog) =>
  [...dialog.querySelectorAll(FOCUSABLE)].filter(visible);

/** Installs the watcher on `doc`; returns an `uninstall` function. */
export const installDialogFocus = (doc = globalThis.document) => {
  if (!doc?.body || typeof globalThis.MutationObserver !== 'function') {
    return () => {};
  }
  const open = []; // { node, openers }, oldest first
  let trail = []; // what was last pressed or focused, newest last

  const remember = (node) => {
    if (node && node !== doc.body) {
      trail = [...trail.filter((n) => n !== node), node].slice(-8);
    }
  };
  // Safari does not focus a button on click, so remember what was pressed;
  // a menu item that opened the dialog is gone by then, its button is not.
  const onPointer = (event) => remember(event.target?.closest?.(OPENER));
  const onFocus = (event) => remember(event.target);

  const restore = (candidates) => {
    const active = doc.activeElement;
    const lost = !active?.isConnected || !active.matches(FOCUSABLE);
    const target = candidates
      .toReversed()
      .find(
        (n) =>
          n.isConnected &&
          n.matches(FOCUSABLE) &&
          !open.some((d) => d.node.contains(n))
      );
    if (lost && target) {
      target.focus?.({ preventScroll: true });
    }
  };

  const sync = () => {
    for (let i = open.length - 1; i >= 0; i -= 1) {
      if (!open[i].node.isConnected) {
        const [{ openers }] = open.splice(i, 1);
        restore(openers);
      }
    }
    for (const node of doc.querySelectorAll(MODAL)) {
      if (open.some((d) => d.node === node)) {
        continue;
      }
      open.push({ node, openers: trail.filter((n) => !node.contains(n)) });
      if (!node.contains(doc.activeElement)) {
        const first = focusablesIn(node)[0] ?? node;
        if (first === node) {
          node.tabIndex = -1;
        }
        first.focus({ preventScroll: true });
      }
    }
  };

  const onKey = (event) => {
    const top = open.at(-1)?.node;
    if (event.key !== 'Tab' || !top?.isConnected) {
      return;
    }
    const items = focusablesIn(top);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    // Stepped here, not left to the browser: Safari's Tab skips buttons.
    const at = items.indexOf(doc.activeElement);
    const step = event.shiftKey ? -1 : 1;
    const next = at === -1 ? (step > 0 ? 0 : items.length - 1) : at + step;
    event.preventDefault();
    items[(next + items.length) % items.length].focus();
  };

  const observer = new globalThis.MutationObserver(sync);
  observer.observe(doc.body, { childList: true, subtree: true });
  doc.addEventListener('pointerdown', onPointer, true);
  doc.addEventListener('focusin', onFocus, true);
  doc.addEventListener('keydown', onKey, true);
  sync();
  return () => {
    observer.disconnect();
    doc.removeEventListener('pointerdown', onPointer, true);
    doc.removeEventListener('focusin', onFocus, true);
    doc.removeEventListener('keydown', onKey, true);
  };
};
