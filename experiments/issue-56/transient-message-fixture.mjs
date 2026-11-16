/* global queueMicrotask */
/** Static page function: each version mounts for one mutation-observer turn. */
export const transientMessageFixture = async ({ root, id }) => {
  const row = document.createElement('article');
  row.dataset.qa = `chatik-chat-message-${id}`;
  row.innerHTML =
    '<p data-qa="chat-bubble-text">First answer</p><span data-qa="status-icon-pending"></span>';
  document.querySelector(root).append(row);
  for (const [body, status] of [
    ['Edited answer', 'failed'],
    ['Final answer', 'delivered'],
  ]) {
    await new Promise((resolve) => queueMicrotask(resolve));
    row.querySelector('p').textContent = body;
    row.querySelector('span').dataset.qa = `status-icon-${status}`;
  }
  await new Promise((resolve) => queueMicrotask(resolve));
  row.remove();
};
