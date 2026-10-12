// PR #34 review: the desktop window opens in the app's own background,
// shows once painted, and narrows only to a phone's width.
import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';

describe('Electron main window', () => {
  it('opens the window in the app background, shown when painted (PR #34)', async () => {
    const { createMainWindow, MIN_WINDOW } =
      await import('../electron/main.js');
    const open = async (dark) => {
      const calls = { options: null, shown: false, url: null };
      class FakeWindow {
        constructor(options) {
          calls.options = options;
        }
        once(event, fn) {
          calls.event = event;
          this.ready = fn;
        }
        show() {
          calls.shown = true;
        }
        async loadURL(url) {
          calls.url = url;
          this.ready();
        }
      }
      await createMainWindow({
        BrowserWindow: FakeWindow,
        port: 4242,
        nativeTheme: { shouldUseDarkColors: dark },
      });
      return calls;
    };
    const css = await fs.readFile('js/src/web/app.css', 'utf8');
    const bg = (block) =>
      css.match(new RegExp(`${block}\\s*{[^}]*?--bg:\\s*(#[0-9a-f]+)`))[1];
    const dark = await open(true);
    expect(dark.options.backgroundColor).toBe(bg(':root'));
    expect(dark.options.show).toBe(false);
    expect(dark.event).toBe('ready-to-show');
    expect(dark.shown).toBe(true);
    expect(dark.url).toBe('http://127.0.0.1:4242/');
    expect((await open(false)).options.backgroundColor).toBe(
      bg(":root\\[data-theme='light'\\]")
    );
    // Down to a phone's width, where the app has its bottom bar.
    expect(dark.options.minWidth).toBe(MIN_WINDOW.width);
    expect(MIN_WINDOW.width <= 390).toBe(true);
  });
});
