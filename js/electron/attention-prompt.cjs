const { ipcRenderer } = require('electron');

const CHANNEL = 'meta-sovereign:attention-prompt';
const choose = (action) => ipcRenderer.invoke(CHANNEL, action).catch(() => {});

globalThis.addEventListener('DOMContentLoaded', async () => {
  const labels = await ipcRenderer.invoke(CHANNEL, 'labels').catch(() => null);
  if (!labels) {
    return;
  }
  const { document } = globalThis;
  document.documentElement.lang = labels.locale;
  document.getElementById('message').textContent = labels.body;
  for (const action of ['show', 'later']) {
    const button = document.getElementById(action);
    button.hidden = !labels[action];
    button.textContent = labels[action] ?? '';
    button.addEventListener('click', () => void choose(action));
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      void choose('later');
    } else if (
      event.key === 'Enter' &&
      labels.show &&
      event.target === document.body
    ) {
      void choose('show');
    }
  });
  void choose('ready');
});
