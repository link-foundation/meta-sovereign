import { cvWorkplaceBrowserFixture } from './cv-workplace-browser-fixture.mjs';
import {
  cvWatchWorkplaceHtml,
  cvWatchWorkplaceExport,
} from './cv-watch-workplace-fixture.mjs';
import { cvWorkplaceListHtml } from './cv-created-workplace-fixture.mjs';

/** Owned synthetic HH origin. Every write is a manual fixture Save, never a provider request. */
export const cvCreatedWorkplaceBrowserFixture = async (browser) => {
  const f = await cvWorkplaceBrowserFixture(browser);
  const { provider } = f;
  let description = 'Original description';
  let ids = ['123'];
  let mode = 'ready';
  const counters = { lists: 0, records: 0, ownerSaves: 0 };
  const url = 'https://hh.ru/profile/edit/experience?resumeFrom=abc123';
  await provider.context().route('**/profile/edit/experience**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      path === '/profile/edit/experience' &&
      !route.request().isNavigationRequest()
    ) {
      counters.lists++;
      return route.fulfill({
        contentType: 'text/html',
        body: `${cvWorkplaceListHtml(
          ids
        )}<script>globalThis.inertNewRecordScriptExecuted=true;</script>`,
      });
    }
    if (
      path !== '/profile/edit/experience' &&
      !route.request().isNavigationRequest()
    ) {
      counters.records++;
    }
    return route.fulfill({
      contentType: 'text/html',
      body:
        cvWatchWorkplaceHtml({
          description:
            mode === 'mismatch' && path.endsWith('/987')
              ? 'Old record description'
              : description,
          secondary: true,
        }) +
        (route.request().isNavigationRequest()
          ? ''
          : '<script>globalThis.inertNewRecordScriptExecuted=true;</script>'),
    });
  });
  await provider.context().route('**/fixture/workplace', (route) => {
    counters.ownerSaves++;
    description = route.request().postData();
    ids =
      mode === 'older'
        ? ['123']
        : mode === 'ambiguous'
          ? ['123', '987', '988']
          : ['123', '987'];
    return route.fulfill({ status: 200, body: 'Saved' });
  });
  await provider.context().route('**/resume_converter/resume.txt?**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: cvWatchWorkplaceExport(description, false).replace(
        'Example Labs',
        new URL(route.request().url()).searchParams.get('hash') === 'russian'
          ? 'Unrelated employer retained in the other CV'
          : 'Example Labs'
      ),
    })
  );
  await provider.goto(url);
  // Only inert readback responses contain the execution trap.
  await provider.evaluate(() => {
    delete globalThis.inertNewRecordScriptExecuted;
  });
  return {
    ...f,
    url,
    createdCounters: counters,
    mode: (value) => {
      mode = value;
    },
    reset: async () => {
      ids = ['123'];
      mode = 'ready';
      await provider.goto(url);
    },
  };
};
