import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { setImmediate as settled } from 'node:timers/promises';
import {
  attachOwnerAttention,
  OWNER_ATTENTION_CHANNEL,
} from '../electron/owner-attention-ipc.js';
import { DesktopOwnerAttention } from '../electron/owner-attention.js';
import {
  attentionPageForeground,
  bindAttentionPage,
} from '../src/automation/attention-foreground.js';
import {
  ATTENTION_ACKNOWLEDGED_MS,
  ATTENTION_POLL_MS,
  ATTENTION_REMIND_MS,
} from '../src/automation/attention-policy.js';
import { serverOwnerAttention } from '../src/server/owner-attention.js';

const start = Date.parse('2026-08-30T12:00:00Z');
const ownerWait = (kind = 'captcha', extra = {}) => ({
  kind,
  id: 'private-review',
  requestId: 'private-request',
  browserSlot: 'private-browser-slot',
  expiresAt: new Date(start + 30 * 60_000).toISOString(),
  focusAvailable: true,
  ...extra,
});
const preferences = { enabled: true, sound: true, locale: 'en' };

const desktopFixture = ({
  supported = true,
  platform = 'linux',
  fallback = false,
} = {}) => {
  const notices = [];
  const prompts = [];
  const deadlines = new Map();
  const focused = [];
  let beepCount = 0;
  let shellWindows = 0;
  let currentTime = start;
  let canceled = 0;
  let current = [];
  let focusResult = { ok: true };
  class Notification extends EventEmitter {
    static isSupported() {
      return supported;
    }
    constructor(options) {
      super();
      this.options = options;
    }
    show() {
      notices.push(this);
    }
    close() {
      this.closed = true;
      this.emit('close', { reason: 'applicationHidden' });
    }
  }
  const owner = {
    read: async () => [...current],
    focus: async (item) => {
      focused.push(item);
      return focusResult;
    },
  };
  const controller = new DesktopOwnerAttention({
    Notification,
    prompt: fallback
      ? (options) => {
          const prompt = { ...options, closed: false };
          prompts.push(prompt);
          return () => {
            prompt.closed = true;
          };
        }
      : undefined,
    owner,
    platform,
    beep: () => beepCount++,
    showWindow: () => shellWindows++,
    now: () => currentTime,
    setInterval: (_task, ms) => {
      assert.equal(ms, ATTENTION_POLL_MS);
      return {};
    },
    clearInterval: (timer) => {
      if (timer) {
        canceled++;
      }
    },
    setTimeout: (task, ms) => {
      assert.equal(ms, 2000);
      const deadline = {};
      deadlines.set(deadline, task);
      return deadline;
    },
    clearTimeout: (deadline) => deadlines.delete(deadline),
  });
  return {
    controller,
    owner,
    notices,
    prompts,
    focused,
    expireDisplayDeadlines() {
      for (const [deadline, task] of deadlines) {
        deadlines.delete(deadline);
        task();
      }
    },
    setWaits: (...waits) => {
      current = waits;
    },
    setFocus: (result) => {
      focusResult = result;
    },
    get beeps() {
      return beepCount;
    },
    get opened() {
      return shellWindows;
    },
    get canceled() {
      return canceled;
    },
    async advance(ms) {
      currentTime += ms;
      await controller.refresh();
    },
  };
};

test(
  'native alerts are private, actionable and independent of a renderer',
  { timeout: 5000 },
  async () => {
    const f = desktopFixture();
    const form = ownerWait();
    const application = ownerWait('hh-application-verification');
    const signIn = ownerWait('hh-manual-login', { focusAvailable: false });
    f.setWaits(form, application, signIn);
    assert.deepEqual(f.controller.configure(preferences), {
      visual: true,
      audio: true,
    });
    await settled();
    assert.equal(f.notices.length, 3);
    assert.equal(f.beeps, 3);
    assert.equal(new Set(f.notices.map(({ options }) => options.body)).size, 3);
    for (const { options } of f.notices) {
      assert.equal(options.title, 'meta-sovereign');
      assert.equal(options.silent, true);
      assert.doesNotMatch(
        JSON.stringify(options),
        /private-review|private-request|private-browser-slot/u
      );
    }
    const [formNotice, applicationNotice, signInNotice] = f.notices;
    assert.deepEqual(
      formNotice.options.actions.map(({ text }) => text),
      ['Show browser', 'Later']
    );
    assert.deepEqual(
      signInNotice.options.actions.map(({ text }) => text),
      ['Later']
    );
    formNotice.emit('action', { actionIndex: 0 });
    formNotice.emit('click');
    applicationNotice.emit('action', {}, 1);
    signInNotice.emit('click');
    await settled();
    assert.deepEqual(f.focused, [form]);
    assert.equal(f.opened, 1);
    assert.equal(formNotice.closed, true);
    assert.equal(applicationNotice.closed, true);
    assert.equal(signInNotice.closed, true);
    f.controller.close();
  }
);

test(
  'unanswered, acknowledged, and failed focus have separate reminder deadlines',
  { timeout: 5000 },
  async () => {
    const f = desktopFixture({ platform: 'win32' });
    const original = ownerWait('hh-manual-login');
    f.setWaits(original);
    f.controller.configure(preferences);
    await settled();
    f.notices[0].emit('close', { reason: 'timedOut' });
    await f.advance(ATTENTION_REMIND_MS - 1);
    assert.equal(f.beeps, 1);
    await f.advance(1);
    assert.equal(f.beeps, 2);
    f.notices[1].emit('close', { reason: 'userCanceled' });
    await f.advance(ATTENTION_ACKNOWLEDGED_MS - 1);
    assert.equal(f.beeps, 2);
    await f.advance(1);
    assert.equal(f.beeps, 3);
    f.setFocus({ ok: false });
    f.notices[2].emit('action', { actionIndex: 0 });
    await settled();
    await f.advance(ATTENTION_REMIND_MS);
    assert.equal(f.beeps, 4);
    f.setWaits(ownerWait('hh-manual-login', { requestId: 'new-request' }));
    await f.advance(1);
    assert.equal(f.notices[3].closed, true);
    f.notices[3].emit('action', { actionIndex: 0 });
    assert.deepEqual(f.focused, [original]);
    assert.deepEqual(await f.controller.acknowledge(original), { ok: false });
    f.controller.close();
  }
);

test(
  'renderer acknowledgement and channel preferences are tied to the current wait',
  { timeout: 5000 },
  async () => {
    const f = desktopFixture({ platform: 'darwin' });
    const wait = ownerWait();
    f.setWaits(wait);
    assert.deepEqual(
      f.controller.configure({ ...preferences, sound: false, locale: 'ru' }),
      { visual: true, audio: false }
    );
    await settled();
    assert.equal(f.beeps, 0);
    assert.match(f.notices[0].options.actions[0].text, /[А-Яа-я]/u);
    assert.deepEqual(await f.controller.acknowledge(wait), { ok: true });
    assert.deepEqual(
      f.controller.configure({ ...preferences, enabled: false }),
      { visual: false, audio: true }
    );
    assert.equal(f.notices[0].closed, true);
    await f.advance(ATTENTION_REMIND_MS);
    assert.equal(f.beeps, 0);
    await f.advance(ATTENTION_ACKNOWLEDGED_MS - ATTENTION_REMIND_MS);
    assert.equal(f.beeps, 1);
    assert.equal(f.notices.length, 1);
    await f.advance(ATTENTION_ACKNOWLEDGED_MS);
    assert.equal(f.beeps, 1, 'expiry retires the wait');
    f.controller.close();
    assert.deepEqual(f.controller.configure(preferences), {
      visual: false,
      audio: false,
    });
    assert.equal(f.canceled, 1);
  }
);

test(
  'unavailable system notifications leave audio independent and shutdown retires pending reads',
  { timeout: 5000 },
  async () => {
    const f = desktopFixture({ supported: false });
    let resume;
    f.owner.read = () =>
      new Promise((resolve) => {
        resume = resolve;
      });
    assert.deepEqual(f.controller.configure(preferences), {
      visual: false,
      audio: true,
    });
    f.controller.close();
    resume([ownerWait()]);
    await settled();
    assert.equal(f.beeps, 0);
    assert.equal(f.notices.length, 0);
    await f.advance(ATTENTION_REMIND_MS);
    assert.equal(f.canceled, 1);
  }
);

test(
  'an unavailable notification system uses a private prompt with live actions',
  { timeout: 5000 },
  async () => {
    const f = desktopFixture({ supported: false, fallback: true });
    const signin = ownerWait('hh-manual-login');
    const headless = ownerWait('hh-application-verification', {
      focusAvailable: false,
    });
    f.setWaits(signin, headless);
    assert.deepEqual(f.controller.configure(preferences), {
      visual: true,
      audio: true,
    });
    await settled();
    assert.equal(f.notices.length, 0);
    assert.equal(f.beeps, 2);
    const [active, background] = f.prompts;
    assert.equal(active.show, 'Show browser');
    assert.equal(background.show, null);
    assert.equal(background.later, 'Later');
    assert.doesNotMatch(
      JSON.stringify(f.prompts),
      /private-review|private-request|private-browser-slot/u
    );
    active.onChoice(true);
    active.onChoice(true);
    background.onChoice(false);
    await settled();
    assert.deepEqual(f.focused, [signin]);
    assert.ok(f.prompts.every(({ closed }) => closed));
    await f.advance(ATTENTION_REMIND_MS);
    assert.equal(f.prompts.length, 2);
    await f.advance(ATTENTION_ACKNOWLEDGED_MS - ATTENTION_REMIND_MS);
    assert.equal(f.prompts.length, 4);
    f.controller.close();
  }
);

test(
  'a failed system alert swaps to the prompt without another chime',
  { timeout: 5000 },
  async () => {
    const f = desktopFixture({ fallback: true });
    const wait = ownerWait();
    f.setWaits(wait);
    f.controller.configure(preferences);
    await settled();
    f.notices[0].emit('failed');
    f.notices[0].emit('failed');
    f.expireDisplayDeadlines();
    await settled();
    assert.equal(f.notices[0].closed, true);
    assert.equal(f.prompts.length, 1);
    assert.equal(f.beeps, 1);
    f.notices[0].emit('action', { actionIndex: 0 });
    f.setWaits();
    await f.advance(1);
    assert.equal(f.prompts[0].closed, true);
    f.prompts[0].onChoice(true);
    assert.deepEqual(f.focused, []);
    f.controller.close();
  }
);

test(
  'a missing show receipt falls back unless the notification appears during verification',
  { timeout: 5000 },
  async () => {
    const f = desktopFixture({ fallback: true });
    const silent = ownerWait();
    const late = ownerWait('hh-manual-login');
    const shown = ownerWait('hh-application-verification');
    f.setWaits(silent, late, shown);
    f.controller.configure(preferences);
    await settled();
    f.notices[2].emit('show');
    f.expireDisplayDeadlines();
    f.notices[1].emit('show');
    await settled();
    assert.equal(f.prompts.length, 1);
    assert.equal(f.notices[0].closed, true);
    assert.equal(f.notices[1].closed, undefined);
    assert.equal(f.notices[2].closed, undefined);
    f.notices[1].emit('failed');
    await settled();
    assert.equal(f.prompts.length, 2);
    assert.equal(f.beeps, 3);
    f.controller.close();
  }
);

test(
  'a pending fallback is discarded when the active wait disappears',
  { timeout: 5000 },
  async () => {
    const f = desktopFixture({ fallback: true });
    const wait = ownerWait();
    f.setWaits(wait);
    f.controller.configure(preferences);
    await settled();
    const read = f.owner.read;
    let resume;
    f.owner.read = () =>
      new Promise((resolve) => {
        resume = resolve;
      });
    f.notices[0].emit('failed');
    f.owner.read = read;
    f.setWaits();
    await f.advance(1);
    resume([wait]);
    await settled();
    assert.equal(f.notices[0].closed, true);
    assert.deepEqual(f.prompts, []);
    assert.equal(f.beeps, 1);
    f.controller.close();
  }
);

test(
  'only the exact focused browser suppresses its reminder until the next five-minute check',
  { timeout: 5000 },
  async () => {
    const f = desktopFixture();
    const form = ownerWait();
    const login = ownerWait('hh-manual-login');
    f.setWaits(form, login);
    let focused = form;
    f.owner.browserState = async (wait) => ({
      active: true,
      focused: wait === focused,
    });
    f.controller.configure(preferences);
    await settled();
    assert.equal(f.beeps, 1);
    assert.match(f.notices[0].options.body, /HeadHunter/u);
    focused = login;
    await f.advance(ATTENTION_REMIND_MS - 1);
    assert.equal(f.beeps, 1);
    await f.advance(1);
    assert.equal(f.beeps, 2);
    assert.match(f.notices[1].options.body, /form review/u);
    assert.equal(f.notices[0].closed, true);
    f.controller.close();
  }
);

test(
  'foreground detection rechecks a failed alert and respects acknowledgement during polling',
  { timeout: 5000 },
  async () => {
    const f = desktopFixture({ fallback: true });
    const form = ownerWait();
    f.setWaits(form);
    f.controller.configure(preferences);
    await settled();
    f.owner.browserState = async () => ({ active: true, focused: true });
    f.notices[0].emit('failed');
    await settled();
    assert.equal(f.notices[0].closed, true);
    assert.deepEqual(f.prompts, []);
    let resume;
    f.owner.browserState = () =>
      new Promise((resolve) => {
        resume = resolve;
      });
    const refresh = f.advance(ATTENTION_REMIND_MS);
    await settled();
    assert.deepEqual(await f.controller.acknowledge(form), { ok: true });
    resume({ active: true, focused: false });
    await refresh;
    assert.equal(f.beeps, 1);
    assert.equal(f.notices.length, 1);
    f.controller.close();
  }
);

test(
  'desktop owner reads isolate failed sources and refuse stale, headless or locked focus',
  { timeout: 5000 },
  async () => {
    const form = ownerWait();
    const application = ownerWait('hh-application-verification');
    const login = ownerWait('hh-manual-login', { focusAvailable: false });
    const focus = [];
    let locked = false;
    const ctx = {
      passcode: { locked: () => locked },
      forms: {
        reviewAttention: () => ({ ok: true, attention: [form] }),
        focusReview: (id, requestId) => {
          focus.push([id, requestId]);
          return { ok: true };
        },
      },
      vacancies: {
        'application-attention': () => ({ ok: true, attention: [application] }),
        'application-attention-focus': (wait) => {
          focus.push(wait);
          return { ok: true };
        },
        'login-attention': () => ({ ok: true, attention: [login] }),
      },
    };
    const owner = serverOwnerAttention(ctx);
    assert.deepEqual(await owner.read(), [form, application, login]);
    assert.deepEqual(await owner.focus(form), { ok: true });
    assert.deepEqual(await owner.focus(application), { ok: true });
    for (const wait of [
      login,
      { ...form, requestId: 'stale' },
      { ...form, browserSlot: 'wrong-slot' },
      { ...form, kind: 'constructor' },
    ]) {
      assert.deepEqual(await owner.focus(wait), { ok: false });
    }
    ctx.vacancies['login-attention'] = () => {
      throw new Error('fixture offline');
    };
    assert.deepEqual(await owner.read(), [form, application]);
    ctx.forms.reviewAttention = async () => {
      locked = true;
      return { ok: true, attention: [form] };
    };
    assert.deepEqual(await owner.focus(form), { ok: false });
    assert.deepEqual(await owner.read(), []);
    locked = false;
    ctx.vacanciesClosing = true;
    assert.deepEqual(await owner.focus(application), { ok: false });
    assert.deepEqual(focus, [[form.id, form.requestId], application]);
  }
);

test(
  'foreground browser state is private and revalidates the live slot and lock after CDP',
  { timeout: 5000 },
  async () => {
    const wait = ownerWait();
    let reads = 0;
    let locked = false;
    let current = [wait];
    const commands = [];
    const cdp = {
      async send(command, args) {
        commands.push([command, args]);
        if (command === 'Page.getFrameTree') {
          return { frameTree: { frame: { id: 'fixture-frame' } } };
        }
        if (command === 'Page.createIsolatedWorld') {
          return { executionContextId: 123 };
        }
        if (command === 'Runtime.evaluate') {
          return { result: { value: true } };
        }
      },
      detach: async () => commands.push(['detach']),
    };
    assert.equal(
      bindAttentionPage(wait, {
        context: () => ({ newCDPSession: async () => cdp }),
      }),
      wait
    );
    assert.deepEqual(JSON.parse(JSON.stringify(wait)), ownerWait());
    const owner = serverOwnerAttention({
      passcode: { locked: () => locked },
      forms: {
        reviewAttention: () => {
          reads++;
          return { ok: true, attention: current };
        },
      },
    });
    assert.deepEqual(await owner.browserState(wait), {
      active: true,
      focused: true,
    });
    assert.deepEqual(
      commands.map(([command]) => command),
      [
        'Emulation.setFocusEmulationEnabled',
        'Page.getFrameTree',
        'Page.createIsolatedWorld',
        'Runtime.evaluate',
        'detach',
      ]
    );
    assert.deepEqual(commands[0][1], { enabled: false });
    assert.match(
      commands[3][1].expression,
      /^document\.visibilityState === "visible" && document\.hasFocus\(\)$/u
    );
    current = [{ ...wait, requestId: 'different' }];
    assert.deepEqual(await owner.browserState(wait), {
      active: false,
      focused: false,
    });
    const detach = cdp.detach;
    cdp.detach = async () => {
      await detach();
      locked = true;
    };
    assert.deepEqual(await owner.browserState(wait), {
      active: false,
      focused: false,
    });
    assert.equal(reads, 2);
  }
);

test(
  'foreground probing times out and shares one unresolved protocol session per page',
  { timeout: 5000 },
  async () => {
    const wait = ownerWait();
    let connects = 0;
    let finish;
    const context = {
      newCDPSession() {
        connects++;
        return new Promise((resolve, reject) => {
          finish = reject;
        });
      },
    };
    const page = { context: () => context };
    bindAttentionPage(wait, page);
    const secondWait = bindAttentionPage(ownerWait(), page);
    assert.deepEqual(
      await Promise.all([
        attentionPageForeground(wait),
        attentionPageForeground(secondWait),
      ]),
      [false, false]
    );
    assert.equal(connects, 1);
    finish(new Error('fixture page closed'));
    await settled();
    assert.equal(await attentionPageForeground({ ...wait }), false);
    assert.equal(connects, 1);
  }
);

test(
  'native attention IPC accepts only exact identity and the owned live main frame',
  { timeout: 5000 },
  async () => {
    const contents = {
      mainFrame: { url: 'http://127.0.0.1:1234/#settings' },
      isDestroyed: () => false,
    };
    const event = { sender: contents, senderFrame: contents.mainFrame };
    const calls = [];
    let invoke;
    let removed = 0;
    const dispose = attachOwnerAttention({
      ipcMain: {
        handle: (channel, callback) => {
          assert.equal(channel, OWNER_ATTENTION_CHANNEL);
          invoke = callback;
        },
        removeHandler: (channel) => {
          assert.equal(channel, OWNER_ATTENTION_CHANNEL);
          removed++;
        },
      },
      attention: {
        configure: (options) => {
          calls.push(options);
          return { visual: true, audio: true };
        },
        acknowledge: async (item) => {
          calls.push(item);
          return { ok: true };
        },
      },
      contents,
      origin: 'http://127.0.0.1:1234',
    });
    const { kind, id, requestId, browserSlot } = ownerWait();
    const identity = { kind, id, requestId, browserSlot };
    assert.deepEqual(await invoke(event, 'configure', preferences), {
      visual: true,
      audio: true,
    });
    assert.deepEqual(await invoke(event, 'acknowledge', identity), {
      ok: true,
    });
    assert.deepEqual(await invoke(event, 'focus', identity), { ok: false });
    assert.deepEqual(
      await invoke(event, 'acknowledge', {
        ...identity,
        browserSlot: 'x'.repeat(257),
      }),
      { ok: false }
    );
    assert.deepEqual(
      await invoke(
        { ...event, senderFrame: { ...contents.mainFrame } },
        'configure',
        preferences
      ),
      { ok: false }
    );
    contents.mainFrame.url = 'https://foreign.invalid/';
    assert.deepEqual(await invoke(event, 'configure', preferences), {
      ok: false,
    });
    contents.mainFrame.url = 'http://127.0.0.1:1234/';
    dispose();
    dispose();
    assert.equal(removed, 1);
    assert.deepEqual(await invoke(event, 'acknowledge', identity), {
      ok: false,
    });
    assert.deepEqual(calls, [preferences, identity]);
  }
);
