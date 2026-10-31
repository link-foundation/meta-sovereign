import { useLayoutEffect } from 'react';

// The floating composer can change height for replies, suggestions and
// previews. Reserve only the space it actually covers, in both chat surfaces.
export const useComposerSpace = (box, following, report) => {
  useLayoutEffect(() => {
    const node = box.current;
    const main = node?.closest('.chat-main');
    if (!node || !main) {
      return undefined;
    }
    let composer = null;
    let reserved = null;
    let frame = null;
    const measure = () => {
      const next = main.querySelector(':scope > .chat-composer');
      if (next !== composer) {
        if (composer) {
          resize?.unobserve(composer);
        }
        composer = next;
        if (composer) {
          resize?.observe(composer);
        }
      }
      const viewport = node.getBoundingClientRect();
      // Rectangles use visual pixels; padding uses layout pixels (also
      // correct inside a scaled host or a transformed preview).
      const scale = viewport.height / node.offsetHeight || 1;
      const space = composer
        ? Math.max(
            0,
            Math.ceil(
              (viewport.bottom - composer.getBoundingClientRect().top) / scale
            )
          )
        : 0;
      report?.('viewport');
      if (space !== reserved) {
        reserved = space;
        node.style.setProperty('--chat-composer-space', `${space}px`);
      }
      // Growing or shrinking the composer follows only an existing live
      // tail. Reading older messages must keep the same viewport.
      if (following.current) {
        node.scrollTop = node.scrollHeight;
      }
    };
    // Mutating padding during observer delivery can leave a WebKit resize
    // notification undelivered. Measure once after all layout changes instead.
    const schedule = () => {
      globalThis.cancelAnimationFrame(frame);
      frame = globalThis.requestAnimationFrame(measure);
    };
    const Resize = globalThis.ResizeObserver;
    const resize = typeof Resize === 'function' ? new Resize(schedule) : null;
    resize?.observe(node, { box: 'border-box' });
    resize?.observe(main, { box: 'border-box' });
    // Closing a topic replaces the floating composer with an in-flow bar.
    const Mutation = globalThis.MutationObserver;
    const children =
      typeof Mutation === 'function' ? new Mutation(schedule) : null;
    children?.observe(main, { childList: true });
    // Native caret scrolling happens after input/focus. Reconcile the tail
    // after it, even for a single-line edit that does not resize the composer.
    main.addEventListener('input', schedule);
    main.addEventListener('focusin', schedule);
    measure();
    return () => {
      resize?.disconnect();
      children?.disconnect();
      globalThis.cancelAnimationFrame(frame);
      main.removeEventListener('input', schedule);
      main.removeEventListener('focusin', schedule);
      node.style.removeProperty('--chat-composer-space');
    };
  }, [box, following, report]);
};
