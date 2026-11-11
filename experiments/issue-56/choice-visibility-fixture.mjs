/** Keep chronology in DOM order while reversing only the visual message pane. */
export const prepareChoiceVisibility = async (page, layout) => {
  await page.evaluate(
    (direction) => {
      const style = document.createElement('style');
      style.textContent = `#history{height:220px;overflow:auto;display:flex;flex-direction:${direction};border:2px solid #64748b}#history article{flex-shrink:0}#history .spacer{height:900px;flex-shrink:0}`;
      document.head.append(style);
      window.mountChoices();
      window.choiceExpected = window.choiceControl({
        spec: window.choiceSpec,
        operation: 'read',
      });
    },
    layout === 'reversed' ? 'column-reverse' : 'column'
  );
  const armed = await page.evaluate(() =>
    window.choiceControl({
      spec: window.choiceSpec,
      expected: window.choiceExpected,
      operation: 'arm',
      option: 'Yes.',
      token: 'visibility-probe',
    })
  );
  if (!armed.armed) {
    throw new Error(`Could not arm visibility probe: ${armed.code}`);
  }
  await page.locator(armed.selector).click();
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.className = 'spacer';
    spacer.textContent = 'Earlier conversation remains available';
    document
      .querySelector('[data-qa="chatik-chat-message-102"]')
      .before(spacer);
    document.querySelector('#history').scrollTop = 0;
  });
};

export const choiceVisibilityReceipt = (page) =>
  page.evaluate(() =>
    window.choiceControl({
      spec: window.choiceSpec,
      expected: window.choiceExpected,
      operation: 'receipt',
      option: 'Yes.',
      token: 'visibility-probe',
      finish: true,
    })
  );

export const choiceVisibilityState = (page) =>
  page.evaluate(() => {
    const pane = document.querySelector('#history');
    const bubble = document.querySelector(
      '[data-qa="chatik-chat-message-102"]'
    );
    const bounds = pane.getBoundingClientRect();
    const reply = bubble.getBoundingClientRect();
    return {
      visible: reply.bottom > bounds.top && reply.top < bounds.bottom,
      scrollTop: pane.scrollTop,
      draft: document.querySelector('textarea').value,
      clicks: window.fixture.clicks,
      textSends: window.fixture.textSends,
    };
  });
