import { assert } from './e2e-chat.mjs';

// Check actual painted geometry, including wrapping and custom action rows.
export const assertControlSpacing = async (page) => {
  const problems = await page.evaluate(() => {
    const visible = (node) => {
      const box = node.getBoundingClientRect();
      const style = globalThis.getComputedStyle(node);
      return (
        box.width > 0 &&
        box.height > 0 &&
        style.visibility !== 'hidden' &&
        box.bottom > 0 &&
        box.top < globalThis.innerHeight
      );
    };
    const parents = new Set(
      [...document.querySelectorAll('button, a.button')]
        .filter(visible)
        .map((node) => node.parentElement)
    );
    const errors = [];
    for (const parent of parents) {
      const controls = [...parent.children].filter(
        (node) => node.matches('button, a.button') && visible(node)
      );
      for (let i = 0; i < controls.length; i++) {
        for (const other of controls.slice(i + 1)) {
          const a = controls[i].getBoundingClientRect();
          const b = other.getBoundingClientRect();
          const horizontal = Math.max(b.left - a.right, a.left - b.right);
          const vertical = Math.max(b.top - a.bottom, a.top - b.bottom);
          if (Math.max(horizontal, vertical) < 1) {
            errors.push(
              `${parent.className || parent.tagName}: ${controls[i].textContent?.trim()} / ${other.textContent?.trim()}`
            );
          }
        }
      }
    }
    return errors;
  });
  assert(
    problems.length === 0,
    `controls must have visible nonzero spacing: ${problems.join('; ')}`
  );
};
