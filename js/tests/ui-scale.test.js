// Interface scale and the proxy page helpers (R-Y192): the scale's steps,
// keys, storage that may throw, how it is put on <html>, proxy link
// parsing and the form bodies. Pure; no browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULTS,
  SCALES,
  applyUiScale,
  chatFontSize,
  factorOf,
  keyDirection,
  readUiScale,
  settingsFrom,
  stepScale,
  writeUiScale,
} from '../src/web/ui-scale.js';
import {
  openProxyLink,
  parseProxyLink,
  PROXY_EVENT,
} from '../src/web/proxy-model.js';
import { formFromLink, formOf, saveBody } from '../src/web/settings-proxy.js';

test('the scales are Desktop steps', () => {
  assert.deepEqual([...SCALES], ['auto', 100, 110, 125, 150, 175, 200]);
  assert.equal(factorOf('auto'), 1);
  assert.equal(factorOf(150), 1.5);
});

test('settings fall back from anything wrong', () => {
  assert.deepEqual(settingsFrom(null), DEFAULTS);
  assert.deepEqual(
    settingsFrom({ scale: 133, textSize: 99, keys: 'yes' }),
    DEFAULTS
  );
  assert.deepEqual(settingsFrom({ scale: 125, textSize: 18, keys: true }), {
    scale: 125,
    textSize: 18,
    keys: true,
  });
});

test('stepping moves along the list and stops at its ends', () => {
  assert.equal(stepScale('auto', 1), 110);
  assert.equal(stepScale('auto', -1), 100);
  assert.equal(stepScale(125, 1), 150);
  assert.equal(stepScale(200, 1), 200);
  assert.equal(stepScale(100, -1), 100);
  assert.equal(stepScale(175, 0), 'auto');
});

test('Ctrl/Cmd + = - 0 are read as a direction', () => {
  assert.equal(keyDirection({ ctrlKey: true, key: '=' }), 1);
  assert.equal(keyDirection({ metaKey: true, key: '+' }), 1);
  assert.equal(keyDirection({ ctrlKey: true, key: '-' }), -1);
  assert.equal(keyDirection({ metaKey: true, key: '0' }), 0);
  assert.equal(keyDirection({ key: '=' }), null);
  assert.equal(keyDirection({ ctrlKey: true, altKey: true, key: '=' }), null);
  assert.equal(keyDirection({ ctrlKey: true, key: 'a' }), null);
});

test('storage that fails never breaks the page', () => {
  const broken = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.deepEqual(readUiScale(broken), DEFAULTS);
  assert.doesNotThrow(() => writeUiScale(DEFAULTS, broken));
  const kept = new Map();
  const memory = {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => kept.set(k, v),
  };
  writeUiScale({ scale: 150, textSize: 17, keys: false }, memory);
  assert.equal(readUiScale(memory).scale, 150);
  assert.equal(readUiScale(memory).textSize, 17);
});

test('the scale goes on <html> as its font size, the text size as a variable', () => {
  const style = new Map();
  const root = {
    style: {
      setProperty: (k, v) => style.set(k, v),
      removeProperty: (k) => style.delete(k),
    },
  };
  applyUiScale({ scale: 150, textSize: 16, keys: false }, root);
  assert.equal(style.get('font-size'), '150%');
  assert.equal(style.get('--chat-font-size'), chatFontSize(16));
  assert.equal(chatFontSize(16), '1rem');
  applyUiScale(DEFAULTS, root);
  assert.equal(style.has('font-size'), false);
  assert.equal(style.has('--chat-font-size'), false);
  assert.doesNotThrow(() => applyUiScale(DEFAULTS, null));
});

test('proxy links name a proxy; others are not', () => {
  assert.deepEqual(
    parseProxyLink(
      `https://t.me/proxy?server=p.example&port=443&secret=${'ab'.repeat(16)}`
    ),
    { kind: 'mtproto', host: 'p.example', port: 443, secret: 'ab'.repeat(16) }
  );
  assert.deepEqual(
    parseProxyLink(
      'https://t.me/socks?server=1.2.3.4&port=1080&user=me&pass=pw'
    ),
    {
      kind: 'socks5',
      host: '1.2.3.4',
      port: 1080,
      username: 'me',
      password: 'pw',
    }
  );
  assert.equal(
    parseProxyLink('tg://proxy?server=p.example&port=1&secret=x').kind,
    'mtproto'
  );
  assert.equal(
    parseProxyLink('tg://socks?server=p.example&port=1').kind,
    'socks5'
  );
  for (const bad of [
    'https://t.me/proxy?port=1',
    'https://t.me/proxy?server=https://x&port=1',
    'https://t.me/proxy?server=x.example&port=70000',
    'https://example.com/proxy?server=x.example&port=1',
    'https://t.me/someone?server=x.example&port=1',
    'https://u:p@t.me/proxy?server=x.example&port=1',
    'not a url',
    null,
  ]) {
    assert.equal(parseProxyLink(bad), null, String(bad));
  }
});

test('a proxy link asks the dialog to open, prefilled, and saves nothing', () => {
  const seen = [];
  const before = globalThis.dispatchEvent;
  globalThis.dispatchEvent = (event) => seen.push(event);
  try {
    assert.equal(
      openProxyLink(
        'https://t.me/proxy?server=p.example&port=443&secret=abcdef0123456789'
      ),
      true
    );
    assert.equal(openProxyLink('https://t.me/joinchat/abcdefgh'), false);
  } finally {
    globalThis.dispatchEvent = before;
  }
  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, PROXY_EVENT);
  assert.equal(seen[0].detail.prefill.host, 'p.example');
});

test('the dialog form turns into a save body without empty secrets', () => {
  const socks = {
    ...formOf({ kind: 'socks5', host: 'h', port: 1080, username: 'u' }),
  };
  assert.deepEqual(saveBody(socks), {
    kind: 'socks5',
    host: 'h',
    port: '1080',
    username: 'u',
  });
  assert.equal(saveBody({ ...socks, password: 'p' }).password, 'p');
  assert.equal(saveBody(socks, { clearPassword: true }).password, '');
  const mt = formFromLink({
    kind: 'mtproto',
    host: 'm',
    port: 443,
    secret: 'abcdef0123456789',
  });
  assert.equal(saveBody(mt).secret, 'abcdef0123456789');
  assert.equal('secret' in saveBody({ ...mt, secret: '' }), false);
  assert.deepEqual(saveBody({ ...mt, kind: 'none' }), { kind: 'none' });
});
