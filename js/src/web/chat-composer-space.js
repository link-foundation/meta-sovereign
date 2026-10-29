import { useLayoutEffect } from 'react';

// The floating composer can change height for replies, suggestions and
// previews. Reserve only the space it actually covers, in both chat surfaces.
export const useComposerSpace = (box, following) => {
  useLayoutEffect(() => {
    const node = box.current;
    const main = node?.closest('.chat-main');
    if (!node || !main) {
      return undefined;
    }
    let composer = null;
    let reserved = null;
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
      if (space === reserved) {
        return;
      }
      reserved = space;
      node.style.setProperty('--chat-composer-space', `${space}px`);
      // Growing or shrinking the composer follows only an existing live
      // tail. Reading older messages must keep the same viewport.
      if (following.current) {
        node.scrollTop = node.scrollHeight;
      }
    };
    const Resize = globalThis.ResizeObserver;
    const resize = typeof Resize === 'function' ? new Resize(measure) : null;
    resize?.observe(node, { box: 'border-box' });
    resize?.observe(main, { box: 'border-box' });
    // Closing a topic replaces the floating composer with an in-flow bar.
    const Mutation = globalThis.MutationObserver;
    const children =
      typeof Mutation === 'function' ? new Mutation(measure) : null;
    children?.observe(main, { childList: true });
    measure();
    return () => {
      resize?.disconnect();
      children?.disconnect();
      node.style.removeProperty('--chat-composer-space');
    };
  }, [box, following]);
};
