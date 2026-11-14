import assert from 'node:assert/strict';

/** Safari on macOS uses Option-Tab to include buttons in native focus traversal. */
export const assertNextControl = async (page, from, expected) => {
  const engine = page.context().browser().browserType().name();
  const key =
    process.platform === 'darwin' && engine === 'webkit' ? 'Alt+Tab' : 'Tab';
  await from.focus();
  await page.keyboard.press(key);
  const state = await expected.evaluate((node) => ({
    focused: node === document.activeElement,
    enabled: !node.disabled,
    activeTag: document.activeElement?.tagName,
    activeDisabled: document.activeElement?.matches(':disabled'),
  }));
  if (process.env.CI_CV_KEYBOARD_DEBUG === '1') {
    console.log('[cv-keyboard]', JSON.stringify({ engine, key, ...state }));
  }
  assert.equal(state.enabled, true, 'Next control must be enabled');
  assert.equal(
    state.focused,
    true,
    'Native keyboard traversal reaches next control'
  );
};
