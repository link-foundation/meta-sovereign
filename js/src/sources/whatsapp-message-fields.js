const caption = (message) =>
  ['image', 'video', 'document'].includes(message.type)
    ? message[message.type]?.caption
    : undefined;

export const whatsappMessageBody = (message) =>
  message.text?.body ||
  message.button?.text ||
  message.interactive?.button_reply?.title ||
  (caption(message) ?? message.caption ?? message.body ?? '');

const invalid = () => {
  throw Object.assign(
    new Error('WhatsApp message destinations are unverified.'),
    { code: 'question-links-invalid' }
  );
};
const record = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
const records = (values) => {
  if (!Array.isArray(values) || values.length > 20 || !values.every(record)) {
    invalid();
  }
  return values;
};

const webDestination = (value) => {
  if (
    typeof value !== 'string' ||
    value.length > 2000 ||
    !/^https?:\/\//iu.test(value) ||
    /\s/u.test(value)
  ) {
    invalid();
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    invalid();
  }
  if (url.username || url.password) {
    invalid();
  }
  return value;
};

const referralDestination = (referral) => {
  if (!record(referral)) {
    invalid();
  }
  return webDestination(referral.source_url);
};

/** Keep action URLs distinct from temporary media returned by the provider. */
export const whatsappMessageTargets = ({ raw, body }) => {
  if (!raw) {
    return undefined;
  }
  const suppliedCaption = caption(raw);
  if (raw.type === 'unknown' || (suppliedCaption && suppliedCaption !== body)) {
    invalid();
  }
  const links =
    raw.referral === undefined ? [] : [referralDestination(raw.referral)];
  if (raw.type === 'contacts') {
    for (const contact of records(raw.contacts)) {
      const { urls = [] } = contact;
      for (const { url } of records(urls)) {
        links.push(webDestination(url));
      }
    }
  }
  if (links.length && whatsappMessageBody(raw) !== body) {
    invalid();
  }
  return links.length ? links : undefined;
};
