import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  openVkAuthorization,
  permittedVkAuthorizationNavigation,
} from '../electron/vk-authorization.js';
import { VK_DESKTOP_AUTHORIZE_URL } from '../src/sources/vk-token-input.js';
import { tokenFixtureValue as token } from '../../experiments/issue-56/vk-token-fixture.mjs';

const fixture = ({ cleanupFailure = false } = {}) => {
  const parent = new EventEmitter();
  parent.isDestroyed = () => false;
  const controller = new AbortController();
  const effects = { cleared: 0, windows: [] };
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      effects.windows.push(this);
      this.webContents = new EventEmitter();
      const session = new EventEmitter();
      session.setPermissionRequestHandler = (handler) => {
        this.permissions = handler;
      };
      session.setPermissionCheckHandler = (handler) => {
        this.check = handler;
      };
      session.clearStorageData = async () => {
        effects.cleared++;
        if (cleanupFailure) {
          throw new Error(token);
        }
      };
      this.webContents.session = session;
      this.webContents.setWindowOpenHandler = (handler) => {
        this.popup = handler;
      };
    }
    isDestroyed() {
      return this.destroyed === true;
    }
    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
    async loadURL(url) {
      this.url = url;
    }
  }
  const result = openVkAuthorization({
    BrowserWindow: Window,
    parent,
    signal: controller.signal,
  });
  return { parent, controller, effects, result, win: effects.windows[0] };
};
const navigate = (win, value, event = 'will-redirect') => {
  let prevented = false;
  win.webContents.emit(
    event,
    {
      preventDefault() {
        prevented = true;
      },
    },
    value
  );
  return prevented;
};

test('VK Electron window isolates remote content and captures only token/account from exact blank redirect', async () => {
  const f = fixture();
  try {
    const prefs = f.win.options.webPreferences;
    assert.equal(prefs.contextIsolation, true);
    assert.equal(prefs.nodeIntegration, false);
    assert.equal(prefs.sandbox, true);
    assert.equal(prefs.webSecurity, true);
    assert.equal(prefs.preload, undefined);
    assert.match(prefs.partition, /^vk-authorization:/);
    assert.equal(f.win.url, VK_DESKTOP_AUTHORIZE_URL);
    assert.equal(
      new URL(f.win.url).searchParams.get('redirect_uri'),
      'https://oauth.vk.com/blank.html'
    );
    let permission;
    f.win.permissions(null, 'camera', (value) => {
      permission = value;
    });
    assert.equal(permission, false);
    assert.equal(f.win.check(), false);
    assert.deepEqual(f.win.popup({ url: 'https://foreign.invalid/' }), {
      action: 'deny',
    });
    assert.equal(navigate(f.win, 'https://id.vk.com/auth'), false);
    assert.equal(
      navigate(
        f.win,
        `https://oauth.vk.com/blank.html#access_token=${token}&user_id=42&private=ignored`
      ),
      true
    );
    assert.deepEqual(await f.result, { token, userId: '42' });
    assert.equal(f.effects.cleared, 1);
    assert.equal(f.win.destroyed, true);
    assert.equal(f.parent.listenerCount('closed'), 0);
  } finally {
    f.controller.abort();
    await f.result.catch(() => {});
  }
});

for (const kind of ['foreign', 'parent', 'cancel', 'manual', 'cleanup']) {
  test(`VK Electron ${kind} termination drains its ephemeral session without returning a credential`, async () => {
    const f = fixture({ cleanupFailure: kind === 'cleanup' });
    try {
      if (kind === 'foreign') {
        navigate(f.win, 'https://foreign.invalid/');
      }
      if (kind === 'parent') {
        f.parent.emit('closed');
      }
      if (kind === 'cancel') {
        f.controller.abort();
      }
      if (kind === 'manual') {
        f.win.destroy();
      }
      if (kind === 'cleanup') {
        navigate(
          f.win,
          `https://oauth.vk.com/blank.html#access_token=${token}`
        );
      }
      await assert.rejects(f.result, (error) => {
        assert.equal(error.message.includes(token), false);
        return (
          error.code ===
          (kind === 'foreign'
            ? 'authorization-navigation-refused'
            : kind === 'cleanup'
              ? 'authorization-cleanup-failed'
              : 'authorization-cancelled')
        );
      });
      assert.equal(f.effects.cleared, 1);
      assert.equal(f.win.destroyed, true);
    } finally {
      f.controller.abort();
      await f.result.catch(() => {});
    }
  });
}

test('VK authorization permits only explicit HTTPS authentication hosts', () => {
  assert.equal(
    permittedVkAuthorizationNavigation('https://login.vk.ru/?a=1'),
    true
  );
  for (const url of [
    'http://oauth.vk.com/',
    'https://oauth.vk.com.evil.invalid/',
    'file:///tmp/a',
    'https://u@oauth.vk.com/',
    'https://oauth.vk.com:8443/',
  ]) {
    assert.equal(permittedVkAuthorizationNavigation(url), false);
  }
});

test('VK token capture ignores subframe fragments and accepts current Electron event details only in the main frame', async () => {
  const f = fixture();
  const url = `https://oauth.vk.com/blank.html#access_token=${token}&user_id=42`;
  let prevented = 0;
  const details = (isMainFrame, value = url) => ({
    url: value,
    isMainFrame,
    preventDefault() {
      prevented++;
    },
  });
  try {
    f.win.webContents.emit('will-frame-navigate', details(false));
    f.win.webContents.emit('will-redirect', details(false));
    f.win.webContents.emit('did-navigate-in-page', details(false), url, false);
    assert.equal(f.win.destroyed, undefined);
    assert.equal(f.effects.cleared, 0);
    f.win.webContents.emit(
      'will-frame-navigate',
      details(false, 'https://foreign.invalid/')
    );
    assert.equal(prevented, 1);
    assert.equal(f.win.destroyed, undefined);
    f.win.webContents.emit('will-redirect', details(true));
    assert.deepEqual(await f.result, { token, userId: '42' });
    assert.equal(f.effects.cleared, 1);
  } finally {
    f.controller.abort();
    await f.result.catch(() => {});
  }
});
