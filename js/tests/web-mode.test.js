/**
 * Browser-only mode (issue #37): the SPA runs without a server, tells
 * the user what is restricted, how to start a local server (npm or
 * GitHub npx) and, in a plain browser, where to get the desktop app.
 */

import { describe, it, expect } from 'test-anywhere';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  DOWNLOAD_PAGE_URL,
  isSafari,
  runtimeOf,
  webModeNotice,
} from '../src/web/web-mode.js';
import { WebModeBanner } from '../src/web/web-mode-banner.js';
import { LocaleContext } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';

const UA = {
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1',
  firefox:
    'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
};

const PAGES = { hostname: 'link-foundation.github.io' };

const render = (props, locale = 'en') => {
  const t = (key) => dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  return renderToStaticMarkup(
    React.createElement(
      LocaleContext.Provider,
      { value: { locale, t, setLocale: () => {}, available: [] } },
      React.createElement(WebModeBanner, props)
    )
  );
};

describe('runtimeOf', () => {
  it('tells Electron, Capacitor and plain browsers apart', () => {
    expect(runtimeOf({ shell: { platform: 'electron' } })).toBe('electron');
    expect(runtimeOf({ shell: { platform: 'web' }, capacitor: {} })).toBe(
      'capacitor'
    );
    expect(runtimeOf({ shell: { platform: 'web' } })).toBe('web');
    expect(runtimeOf({ shell: undefined, capacitor: undefined })).toBe('web');
  });
});

describe('isSafari', () => {
  it('matches Safari on macOS and iOS only', () => {
    expect(isSafari(UA.safariMac)).toBe(true);
    expect(isSafari(UA.safariIos)).toBe(true);
    expect(isSafari(UA.chrome)).toBe(false);
    expect(isSafari(UA.chromeIos)).toBe(false);
    expect(isSafari(UA.firefox)).toBe(false);
    expect(isSafari(undefined)).toBe(false);
  });
});

describe('webModeNotice', () => {
  it('stays hidden while discovering and once a server is connected', () => {
    expect(webModeNotice({ online: null, runtime: 'web' })).toBe(null);
    expect(webModeNotice({ online: true, runtime: 'web' })).toBe(null);
  });

  it('offers the npm and the GitHub npx command', () => {
    const notice = webModeNotice({ online: false, runtime: 'web' });
    expect(notice.commands.map((option) => option.command)).toEqual([
      'npx -y meta-sovereign serve',
      'npx -y github:link-foundation/meta-sovereign serve',
    ]);
  });

  it('links the download page next to the SPA on GitHub Pages', () => {
    expect(
      webModeNotice({ online: false, runtime: 'web', location: PAGES })
        .downloadHref
    ).toBe('./download/');
    expect(
      webModeNotice({
        online: false,
        runtime: 'web',
        location: { hostname: '' },
      }).downloadHref
    ).toBe(DOWNLOAD_PAGE_URL);
  });

  it('hides the download link inside the desktop and mobile apps', () => {
    for (const runtime of ['electron', 'capacitor']) {
      const notice = webModeNotice({
        online: false,
        runtime,
        userAgent: UA.safariIos,
      });
      expect(notice.downloadHref).toBe(null);
      expect(notice.safariHint).toBe(false);
    }
  });

  it('adds the Safari loopback hint only for Safari', () => {
    const hint = (userAgent) =>
      webModeNotice({ online: false, runtime: 'web', userAgent }).safariHint;
    expect(hint(UA.safariMac)).toBe(true);
    expect(hint(UA.chrome)).toBe(false);
  });
});

describe('WebModeBanner', () => {
  it('renders nothing while a server is connected', () => {
    expect(render({ online: true })).toBe('');
  });

  it('renders the restricted-mode copy, commands and download link', () => {
    const notice = webModeNotice({
      online: false,
      runtime: 'web',
      userAgent: UA.safariMac,
      location: PAGES,
    });
    const html = render({ online: false, notice }, 'ru');
    for (const key of [
      'webMode.title',
      'webMode.retry',
      'webMode.download',
      'webMode.dismiss',
      'guide.localServer.github',
    ]) {
      expect(html).toContain(dictionaries.ru[key]);
    }
    expect(html).toContain('github:link-foundation/meta-sovereign serve');
    expect(html).toContain('href="./download/"');
    expect(html).toContain('data-runtime="web"');
  });

  it('drops the download link in Electron', () => {
    const notice = webModeNotice({ online: false, runtime: 'electron' });
    const html = render({ online: false, notice });
    expect(html).toContain(dictionaries.en['webMode.title']);
    expect(html).not.toContain(dictionaries.en['webMode.download']);
    expect(html).not.toContain(dictionaries.en['webMode.safari']);
  });
});

describe('api.rediscover', () => {
  it('reloads only when a server answers', async () => {
    const { api } = await import('../src/web/dom.js');
    let reloads = 0;
    const reload = () => {
      reloads += 1;
    };
    expect(await api.rediscover({ discover: async () => null, reload })).toBe(
      false
    );
    expect(reloads).toBe(0);
    expect(
      await api.rediscover({
        discover: async () => ({ origin: 'http://127.0.0.1:8787' }),
        reload,
      })
    ).toBe(true);
    expect(reloads).toBe(1);
  });
});
