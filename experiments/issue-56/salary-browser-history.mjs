/** Actual rendered context in an owned HH fixture, including a delivered reply. */
export const mountSalaryHistory = async ({ page, send }, recent = []) => {
  // Open the production sender's owned session before editing its routed DOM.
  await send.readAnswerChoices({ source: 'hh', chat: '7' });
  return page.evaluate((entries) => {
    const history = document.querySelector('#history');
    const question = history.lastElementChild;
    const at = Date.parse('2026-11-17T10:00:00Z');
    question.setAttribute('data-time', new Date(at).toISOString());
    const preceding = [...entries].reverse();
    if (!preceding.length) {
      return;
    }
    preceding.push('Thanks, noted.');
    for (const [index, entry] of preceding.entries()) {
      const row = document.createElement('article');
      row.dataset.qa = `chatik-chat-message-${10 + index}`;
      row.setAttribute(
        'data-time',
        new Date(at - (preceding.length - index) * 60000).toISOString()
      );
      const body = document.createElement('p');
      body.dataset.qa = 'chat-bubble-text';
      body.textContent = typeof entry === 'string' ? entry : entry.text;
      row.append(body);
      if (index === preceding.length - 1) {
        const status = document.createElement('span');
        status.dataset.qa = 'status-icon-delivered';
        row.append(status);
      }
      history.insertBefore(row, question);
    }
  }, recent);
};
