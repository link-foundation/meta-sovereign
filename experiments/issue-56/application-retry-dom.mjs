/** An actual native submit receives one synthetic, explicit provider rejection. */
export const rejectNativeApplication = async (page, counter) => {
  page.on('console', (message) => {
    if (message.text() === 'synthetic-native-application-rejection') {
      counter.rejections++;
    }
  });
  await page.evaluate(() => {
    const form = document.querySelector('#native-form');
    const success = form.onsubmit;
    let reject = true;
    form.onsubmit = (event) => {
      if (!reject) {
        return success(event);
      }
      reject = false;
      event.preventDefault();
      globalThis.applicationAttempts++;
      const error = document.createElement('div');
      error.id = 'fixture-native-error';
      error.setAttribute('data-qa-popup-error-code', 'unknown');
      error.textContent = 'An error occurred, please try again';
      form.append(error);
      console.log('synthetic-native-application-rejection');
    };
  });
};
