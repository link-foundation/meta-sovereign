export const ATTENTION_POLL_MS = 6000;
export const ATTENTION_REMIND_MS = 5 * 60_000;
export const ATTENTION_ACKNOWLEDGED_MS = 15 * 60_000;

export const attentionNotification = Object.freeze({
  captcha: 'forms.attention.notification',
  'hh-application-verification': 'application.attention.notification',
  'hh-manual-login': 'jobLogin.attention.notification',
});
