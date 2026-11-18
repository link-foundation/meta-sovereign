import { browserQuestion } from './question-browser-fixture.mjs';

export const pendingSnapshot = () => ({
  ...browserQuestion(),
  pendingTurn: {
    boundary: { kind: 'outgoing', id: '98', body: 'Previous owner reply' },
    messages: [
      { id: '100', body: 'What is your expected salary?' },
      { id: '101', body: browserQuestion().question.body },
    ],
  },
});

/** Invoked only inside an isolated provider fixture. */
export const mountPendingHistory = () => {
  const history = document.querySelector('#history');
  const latest = history.lastElementChild;
  const id = Number(latest.dataset.qa.split('-').at(-1));
  for (const [offset, body, outgoing] of [
    [3, 'Previous owner reply', true],
    [1, 'What is your expected salary?', false],
  ]) {
    const row = document.createElement('article');
    row.dataset.qa = `chatik-chat-message-${id - offset}`;
    const text = document.createElement('p');
    text.dataset.qa = 'chat-bubble-text';
    text.textContent = body;
    row.append(text);
    if (outgoing) {
      const status = document.createElement('span');
      status.dataset.qa = 'status-icon-delivered';
      row.append(status);
    }
    history.insertBefore(row, latest);
  }
};

export const editPendingMessage = (body) => {
  document.querySelectorAll('#history article p')[1].textContent = body;
};
