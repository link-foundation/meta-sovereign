import { loadPreviousModule } from './previous-module.mjs';

// Inspect one existing owned scenario; no retry, network provider or deadline change.
loadPreviousModule(
  'ef34179a',
  'js/tests/e2e-profile-extras-browser.mjs',
  (source) =>
    source.replace(
      "page.on('console', (message) => {",
      `
await page.addInitScript(() => {
  const ids = new WeakMap();
  let next = 0;
  const id = (node) => {
    if (!node) return null;
    if (!ids.has(node)) ids.set(node, ++next);
    return ids.get(node);
  };
  const snapshot = (event) => {
    const row = document.querySelector('[data-chat="telegram:42"]');
    const target = event?.target;
    return { event: event?.type, at: performance.now(), row: id(row),
      y: row?.getBoundingClientRect().y,
      target: id(target), tag: target?.tagName, chat: target?.closest?.('[data-chat]')?.dataset.chat,
      birthdays: document.querySelector('.birthdays-block')?.textContent,
      loading: document.querySelector('.chat-more')?.textContent };
  };
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    globalThis.addEventListener(type, (event) => {
      console.log('[selection-probe]', JSON.stringify(snapshot(event)));
    }, true);
  }
  document.addEventListener('DOMContentLoaded', () => {
    let previous = '';
    const inspect = () => {
      const value = JSON.stringify(snapshot());
      const state = value.replace(/"at":[0-9.]+,?/u, '');
      if (state !== previous) {
        console.log('[selection-probe]', value);
        previous = state;
      }
    };
    new MutationObserver(inspect).observe(document.body, { childList: true, subtree: true });
  });
});
page.on('console', (message) => {
  if (message.text().startsWith('[selection-probe]')) console.log(message.text());
`
    )
);
await import('../../js/tests/e2e-profile-extras-browser.mjs');
