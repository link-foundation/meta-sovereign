import {
  ATTENTION_ACKNOWLEDGED_MS,
  ATTENTION_POLL_MS,
  ATTENTION_REMIND_MS,
  attentionNotification,
} from '../src/automation/attention-policy.js';
import { availableLocales, translate } from '../src/web/i18n.js';

const itemKey = ({ kind, id, requestId, browserSlot }) =>
  JSON.stringify([kind, id, requestId, browserSlot]);

const SHOW_WAIT_MS = 2000;

const traceAttention = () => {
  if (process.env.MS_LIFECYCLE_DEBUG === '1') {
    console.error('[desktop] owner_attention_notification_unavailable');
  }
};

/** Keep actionable system notifications tied to the local, live browser owner. */
export class DesktopOwnerAttention {
  constructor({
    Notification,
    beep,
    prompt,
    owner,
    showWindow,
    platform = process.platform,
    now = Date.now,
    setInterval = globalThis.setInterval,
    clearInterval = globalThis.clearInterval,
    setTimeout = globalThis.setTimeout,
    clearTimeout = globalThis.clearTimeout,
  }) {
    Object.assign(this, {
      Notification,
      beep,
      prompt,
      owner,
      showWindow,
      platform,
      now,
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
    });
    this.entries = new Map();
    this.visual = false;
    this.audio = false;
    this.closed = false;
  }

  get enabled() {
    return this.visual || this.audio;
  }

  configure({ enabled, sound, locale }) {
    if (
      this.closed ||
      !this.owner ||
      typeof enabled !== 'boolean' ||
      typeof sound !== 'boolean' ||
      !availableLocales.some((entry) => entry.id === locale)
    ) {
      return { visual: false, audio: false };
    }
    this.locale = locale;
    this.systemVisual = Boolean(enabled && this.Notification?.isSupported?.());
    this.visual = enabled && Boolean(this.systemVisual || this.prompt);
    this.audio = sound && typeof this.beep === 'function';
    if (!this.enabled) {
      this.stop();
    } else if (this.timer === undefined) {
      this.start();
    } else if (!this.visual) {
      this.entries.forEach((entry) => this.dismiss(entry));
    }
    return { visual: this.visual, audio: this.audio };
  }

  start() {
    this.timer = this.setInterval(() => void this.refresh(), ATTENTION_POLL_MS);
    this.timer.unref?.();
    void this.refresh();
  }

  stop() {
    this.visual = false;
    this.audio = false;
    this.clearInterval(this.timer);
    this.timer = undefined;
    this.entries.forEach((entry) => this.dismiss(entry));
    this.entries.clear();
  }

  close() {
    this.closed = true;
    this.stop();
  }

  async acknowledge(item) {
    if (!this.enabled) {
      return { ok: false };
    }
    const key = itemKey(item);
    const generation = this.timer;
    const alive = (await this.owner.read()).some(
      (current) =>
        itemKey(current) === key && Date.parse(current.expiresAt) > this.now()
    );
    if (!alive || !this.enabled || generation !== this.timer) {
      return { ok: false };
    }
    const entry = this.entries.get(key) ?? { item };
    this.delay(entry, ATTENTION_ACKNOWLEDGED_MS);
    this.entries.set(key, entry);
    return { ok: true };
  }

  dismiss(entry) {
    const release = entry.release;
    entry.release = null;
    release?.();
  }

  delay(entry, duration) {
    this.dismiss(entry);
    entry.next = this.now() + duration;
  }

  async select(entry, focus) {
    if (Date.parse(entry.item.expiresAt) <= this.now()) {
      this.dismiss(entry);
      return;
    }
    this.delay(entry, ATTENTION_ACKNOWLEDGED_MS);
    if (focus) {
      try {
        if ((await this.owner.focus(entry.item))?.ok === true) {
          return;
        }
      } catch {
        // The anchored browser may have closed between alert and activation.
      }
      entry.next = this.now() + ATTENTION_REMIND_MS;
    }
  }

  post(entry) {
    this.delay(entry, ATTENTION_REMIND_MS);
    if (this.audio) {
      try {
        this.beep();
      } catch {
        traceAttention();
      }
    }
    if (!this.visual) {
      return;
    }
    if (this.systemVisual) {
      this.postSystemAlert(entry);
    } else {
      this.postPrompt(entry);
    }
  }

  labels(entry) {
    const { kind, focusAvailable } = entry.item;
    const { locale } = this;
    return {
      locale,
      title: translate(locale, 'appName'),
      body: translate(locale, attentionNotification[kind]),
      show: focusAvailable ? translate(locale, 'forms.attention.show') : null,
      later: translate(locale, 'forms.attention.later'),
    };
  }

  postPrompt(entry) {
    let dispose;
    const release = () => dispose?.();
    entry.release = release;
    try {
      dispose = this.prompt({
        ...this.labels(entry),
        onChoice: (focus) => {
          if (entry.release === release) {
            void this.select(entry, focus);
          }
        },
      });
      if (entry.release !== release) {
        dispose?.();
      }
    } catch {
      this.dismiss(entry);
      traceAttention();
    }
  }

  async recoverAlert(entry, release, shouldRecover) {
    traceAttention();
    let current;
    if (this.prompt) {
      try {
        const key = itemKey(entry.item);
        current = (await this.owner.read()).find(
          (item) =>
            itemKey(item) === key && Date.parse(item.expiresAt) > this.now()
        );
      } catch {
        // A failed read cannot establish that the same owner still needs a prompt.
      }
    }
    if (entry.release === release && shouldRecover()) {
      this.dismiss(entry);
      if (this.visual && current) {
        entry.item = current;
        this.postPrompt(entry);
      }
    }
  }

  postSystemAlert(entry) {
    const { body, title, show, later } = this.labels(entry);
    const focusAvailable = Boolean(show);
    let notification;
    try {
      notification = new this.Notification({
        title,
        body,
        silent: true,
        timeoutType: 'never',
        actions: [show, later]
          .filter(Boolean)
          .map((text) => ({ type: 'button', text })),
      });
    } catch {
      traceAttention();
      if (this.prompt) {
        this.postPrompt(entry);
      }
      return;
    }
    let deadline;
    let shown = false;
    let failedToShow = false;
    let checking = false;
    const clearDeadline = () => this.clearTimeout(deadline);
    const displayed = () => {
      shown = true;
      clearDeadline();
    };
    const shouldRecover = () => failedToShow || !shown;
    const recover = () => {
      if (entry.release === release && !checking && shouldRecover()) {
        checking = true;
        void this.recoverAlert(entry, release, shouldRecover).finally(() => {
          checking = false;
        });
      }
    };
    const failed = () => {
      failedToShow = true;
      clearDeadline();
      recover();
    };
    const select = (focus) => {
      if (entry.release === release) {
        void this.select(entry, focus);
      }
    };
    const click = () => {
      if (focusAvailable) {
        select(true);
      } else if (entry.release === release) {
        this.dismiss(entry);
        void Promise.resolve(this.showWindow?.()).catch(traceAttention);
      }
    };
    const action = (event, legacyIndex) => {
      const index = event?.actionIndex ?? legacyIndex;
      if (index === 0 || (focusAvailable && index === 1)) {
        select(focusAvailable && index === 0);
      }
    };
    const close = (event) => {
      if (
        (this.platform === 'win32' && event?.reason === 'userCanceled') ||
        this.platform === 'darwin'
      ) {
        select(false);
      }
    };
    const release = () => {
      clearDeadline();
      notification.off('show', displayed);
      notification.off('click', click);
      notification.off('action', action);
      notification.off('close', close);
      notification.off('failed', failed);
      notification.close();
    };
    entry.release = release;
    notification.on('show', displayed);
    notification.on('click', click);
    notification.on('action', action);
    notification.on('close', close);
    notification.on('failed', failed);
    if (this.prompt) {
      deadline = this.setTimeout(recover, SHOW_WAIT_MS);
      deadline.unref?.();
    }
    try {
      notification.show();
    } catch {
      failed();
    }
  }

  async refresh() {
    if (!this.enabled || this.reading) {
      return;
    }
    const generation = this.timer;
    this.reading = true;
    try {
      const current = await this.owner.read();
      if (!this.enabled || generation !== this.timer) {
        return;
      }
      this.reconcile(current);
    } catch {
      traceAttention();
    } finally {
      this.reading = false;
    }
  }

  reconcile(current) {
    const time = this.now();
    const live = new Map(
      current
        .filter(
          (item) =>
            Object.hasOwn(attentionNotification, item.kind) &&
            Date.parse(item.expiresAt) > time
        )
        .map((item) => [itemKey(item), item])
    );
    for (const [key, entry] of this.entries) {
      if (!live.has(key)) {
        this.dismiss(entry);
        this.entries.delete(key);
      }
    }
    for (const [key, item] of live) {
      const entry = this.entries.get(key) ?? { next: time };
      this.entries.set(key, entry);
      entry.item = item;
      if (entry.next <= time) {
        this.post(entry);
      }
    }
  }
}
