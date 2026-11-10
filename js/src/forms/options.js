export const formFailure = (code, message) =>
  Object.assign(new Error(message), { code });
export const formUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw formFailure('form-url', 'Enter an absolute HTTP or HTTPS form URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw formFailure(
      'form-url',
      'Use an HTTP or HTTPS form URL without embedded credentials.'
    );
  }
  return url.href;
};
