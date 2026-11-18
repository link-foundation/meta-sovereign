/** Synthetic native errors only; no live provider or application endpoint. */
export const changeApplicationHoldFixture = (kind) => {
  document.querySelector('#fixture-native-error')?.remove();
  if (!kind || kind === 'clear') {
    return;
  }
  const node = document.createElement('div');
  node.id = 'fixture-native-error';
  if (kind === 'verification') {
    node.setAttribute('data-qa', 'captcha');
    node.textContent = 'Manual verification required';
  } else if (kind === 'generic-text-ru' || kind === 'generic-text-en') {
    node.setAttribute('role', 'alert');
    node.textContent = kind.endsWith('ru')
      ? 'Произошла ошибка, попробуйте ещё раз'
      : 'An error occurred, please try again';
  } else {
    node.setAttribute(
      'data-qa-popup-error-code',
      kind === 'generic-error'
        ? 'unknown'
        : kind === 'daily-limit'
          ? 'negotiations-limit-exceeded'
          : 'invalid-resume'
    );
    node.textContent = 'Synthetic native application error';
  }
  document.querySelector('#native-form').append(node);
};
