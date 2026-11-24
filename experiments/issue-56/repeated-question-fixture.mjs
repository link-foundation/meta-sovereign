/** Mount one previous question and delivered owner answer before its repetition. */
export const mountRepeatedQuestion = () => {
  const history = document.querySelector('#history');
  const latest = history.lastElementChild;
  const number = Number(latest.dataset.qa.match(/\d+$/u)[0]);
  const previous = latest.cloneNode(true);
  previous.dataset.qa = `chatik-chat-message-${number - 2}`;
  previous.dataset.time = '2026-11-11T09:59:00Z';
  const reply = document.createElement('article');
  reply.dataset.qa = `chatik-chat-message-${number - 1}`;
  reply.dataset.time = '2026-11-11T09:59:30Z';
  reply.className = 'outgoing';
  const body = document.createElement('p');
  body.dataset.qa = 'chat-bubble-text';
  body.textContent = 'Yes';
  const receipt = document.createElement('span');
  receipt.dataset.qa = 'status-icon-delivered';
  reply.append(body, receipt);
  latest.dataset.time = '2026-11-11T10:00:00Z';
  history.prepend(previous, reply);
};
