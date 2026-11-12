import { makeBrowserCommander } from 'browser-commander';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { cvWatchHash } from './cv-watch-fixture.mjs';

const escape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
export const cvWatchSavedHtml = (about) =>
  `<!doctype html><html><body><h1 class="resume__title">Example owner</h1><h2 class="resume__position">Engineer</h2><p>Resume updated 12 November 2026</p><div class="resume-skils"><p class="bloko-form-hint">About me</p>${escape(about).replaceAll('\n', '<br>')}</div></body></html>`;
const editorHtml = (
  about
) => `<!doctype html><html lang="en"><head><style>body{font:18px system-ui;margin:40px;max-width:800px}textarea{display:block;width:90%;min-height:180px;margin:20px 0}button{padding:12px;margin:8px}</style></head><body><h1>Existing HH CV editor fixture</h1><p>The owner controls Save and Cancel.</p><form><textarea data-qa="resume-editor-about" aria-label="About me">${escape(about)}</textarea><button type="button" data-qa="resume-partial-edit-save">Save</button><button type="button" data-qa="resume-partial-edit-cancel">Cancel</button><div role="dialog"><button type="button" data-qa="profile-layout-save-button">Save industry picker</button></div></form><script>
globalThis.ownerClicks = 0; globalThis.ownerInputs = 0;
document.addEventListener('click', () => globalThis.ownerClicks++);
document.addEventListener('input', () => globalThis.ownerInputs++);
document.querySelector('[data-qa="resume-partial-edit-save"]').onclick = async () => {
  const response = await fetch('/fixture/save', {method:'POST',body:document.querySelector('textarea').value});
  if (response.ok) location.href='/resume/${cvWatchHash}?hhtmFrom=resume_partial_edit';
};
document.querySelector('[data-qa="resume-partial-edit-cancel"]').onclick = () => { location.href='/resume/${cvWatchHash}'; };
</script></body></html>`;

export const cvSaveWatchBrowserFixture = async (browser) => {
  const native = await browser.newContext();
  const provider = await native.newPage();
  const counters = {
    attachments: 0,
    detached: 0,
    saves: 0,
    reads: 0,
    ownerNavigations: 0,
  };
  let about = 'Original About';
  let mode = 'ready';
  let app;
  await native.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://hh.ru') {
      return route.abort('blockedbyclient');
    }
    if (url.pathname === '/fixture/save') {
      counters.saves++;
      if (mode === 'validation') {
        return route.fulfill({ status: 422, body: 'Validation failed' });
      }
      if (mode !== 'mismatch') {
        about = route.request().postData();
      }
      return route.fulfill({ status: 200, body: 'Saved' });
    }
    if (url.pathname === '/resume_converter/resume.txt') {
      counters.reads++;
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body:
          mode === 'challenge'
            ? '<input name="captcha">'
            : cvWatchSavedHtml(about),
      });
    }
    counters.ownerNavigations++;
    return route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: url.pathname.includes('/edit/')
        ? editorHtml(about)
        : `<h1>Saved CV fixture</h1><p data-qa="resume-block-skills-content">${escape(about)}</p>`,
    });
  });
  await provider.goto(`https://hh.ru/resume/edit/${cvWatchHash}/about`);
  try {
    app = await vacancyBrowserFixture(browser, {
      exports: {
        service: () => ({
          cvWatch: {
            attach: async () => {
              counters.attachments++;
              const commander = makeBrowserCommander({
                page: provider,
                enableNetworkTracking: false,
                enableNavigationManager: false,
                enableDialogManager: false,
              });
              return {
                page: provider,
                commander,
                detach: async () => {
                  counters.detached++;
                  await commander.destroy();
                },
              };
            },
            verification: { pollMs: 50, verificationMs: 1500 },
          },
        }),
      },
    });
    return {
      ...app,
      provider,
      counters,
      mode: (value) => {
        mode = value;
      },
      openEditor: () =>
        provider.goto(`https://hh.ru/resume/edit/${cvWatchHash}/about`),
      close: async () => {
        await app.close();
        await native.close();
      },
    };
  } catch (error) {
    await app?.close();
    await native.close();
    throw error;
  }
};
