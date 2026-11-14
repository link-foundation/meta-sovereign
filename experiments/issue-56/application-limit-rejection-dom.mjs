/** The isolated provider refuses one issued Send; no live account is involved. */
export const rejectNativeApplicationAtLimit = () => {
  document.querySelector('#native-form').onsubmit = (event) => {
    event.preventDefault();
    globalThis.applicationAttempts++;
    const banner = document.createElement('div');
    banner.setAttribute(
      'data-qa-popup-error-code',
      'negotiations-limit-exceeded'
    );
    banner.textContent = 'Daily application limit reached';
    document.body.append(banner);
  };
};
