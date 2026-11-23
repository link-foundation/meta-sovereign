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
  const originalDescription = 'Original description';
  let description = originalDescription;
  let ids = ['123'];
  let mode = 'ready';
  const counters = { lists: 0, records: 0, ownerSaves: 0, exports: 0 };
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
            path.endsWith('/987') && mode === 'mismatch'
              ? 'Old record description'
              : path.endsWith('/987')
                ? description
                : originalDescription,
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
  await provider
    .context()
    .route('**/resume_converter/resume.txt?**', (route) => {
      counters.exports++;
      const original = cvWatchWorkplaceExport(originalDescription, false);
      const otherCv =
        new URL(route.request().url()).searchParams.get('hash') === 'russian';
      let body = original;
      if (otherCv) {
        body = original.replace(
          'Example Labs',
          'Unrelated employer retained in the other CV'
        );
      } else if (ids.includes('987') && mode !== 'stale-export') {
        const workplace = /<div class="resume-experience">.*?<\/div>/su;
        const added = cvWatchWorkplaceExport(description, false).match(
          workplace
        )[0];
        body = original.replace(workplace, (existing) => added + existing);
      }
      return route.fulfill({
        contentType: 'text/html',
        body,
      });
    });
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
      description = originalDescription;
      await provider.goto(url);
    },
  };
};
