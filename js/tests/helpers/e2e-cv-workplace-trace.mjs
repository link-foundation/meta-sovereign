import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Opt-in fixture diagnostics omit selected identities and workplace text. */
export const installCvWorkplaceTrace = async (page) => {
  if (process.env.CI_CV_WORKPLACE_DEBUG !== '1') {
    return async () => {};
  }
  const requests = [];
  const record = (entry) => {
    requests.push(entry);
    if (requests.length > 24) {
      requests.shift();
    }
  };
  const relevant = (request) =>
    new URL(request.url()).pathname.startsWith('/api/vacancies/cv-workplace-');
  page.on('request', (request) => {
    if (relevant(request)) {
      record({ path: new URL(request.url()).pathname, phase: 'requested' });
    }
  });
  page.on('response', (response) => {
    if (relevant(response.request())) {
      record({
        path: new URL(response.url()).pathname,
        phase: 'responded',
        status: response.status(),
      });
    }
  });
  await page.addInitScript(() => {
    const events = [];
    globalThis[Symbol.for('meta-sovereign.test.workplace.v1')] = events;
    for (const type of ['change', 'click']) {
      document.addEventListener(type, (event) => {
        const target = event.target;
        if (!target.closest?.('[data-cv-workplace-review]')) {
          return;
        }
        events.push({
          type,
          export: target.hasAttribute('data-cv-workplace-export'),
          action: target.getAttribute('data-cv-workplace-action'),
          trusted: event.isTrusted,
        });
        if (events.length > 24) {
          events.shift();
        }
      });
    }
  });
  return async (phase) => {
    const state = await page.evaluate(() => {
      const panel = document.querySelector('[data-cv-workplace-review]');
      const select = panel?.querySelector('[data-cv-workplace-export]');
      const load = panel?.querySelector(
        '[data-cv-workplace-action="loadSource"]'
      );
      return {
        panel: Boolean(panel),
        exportSelected: Boolean(select?.value),
        exportOptions: select?.options.length,
        loadDisabled: load?.disabled,
        fields: Boolean(panel?.querySelector('[data-cv-workplace-fields]')),
        error: document
          .querySelector('[data-vacancy-error]')
          ?.textContent?.slice(0, 160),
        events:
          globalThis[Symbol.for('meta-sovereign.test.workplace.v1')] ?? [],
      };
    });
    console.log(
      '[cv-workplace-debug]',
      JSON.stringify({ phase, state, requests })
    );
    if (phase === 'failed' && process.env.E2E_ARTIFACT_DIR) {
      await mkdir(process.env.E2E_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({
        path: join(
          process.env.E2E_ARTIFACT_DIR,
          'cv-workplace-fields-failed.png'
        ),
      });
    }
  };
};
