// Native keyboard activation stays bound to the summary when layout shifts.
// Check focus and the resulting state; never assign open or repeat a toggle.
export const openFollowDisclosure = async (card) => {
  const summary = card.locator(':scope > summary');
  await summary.waitFor({ state: 'visible' });
  if (await card.evaluate((node) => node.open)) {
    return;
  }
  await summary.focus();
  if (!(await summary.evaluate((node) => node === document.activeElement))) {
    throw new Error('The Follow summary did not receive native focus.');
  }
  await summary.press('Enter');
  if (!(await card.evaluate((node) => node.open))) {
    throw new Error('The Follow disclosure did not open.');
  }
};
