import { cvSaveWatchBrowserFixture } from './cv-watch-browser-fixture.mjs';
import {
  cvWatchWorkplaceHtml,
  cvWatchWorkplaceExport,
} from './cv-watch-workplace-fixture.mjs';
import { resumeIndustriesFixture } from './resume-export-fixture.mjs';

export const cvWorkplaceBrowserFixture = async (browser) => {
  const fixture = await cvSaveWatchBrowserFixture(browser);
  const { provider, store } = fixture;
  const url = 'https://hh.ru/profile/edit/experience/123';
  let description = '';
  const modes = {
    mismatch: false,
    membershipMismatch: false,
    challenge: false,
  };
  let recordReads = 0;
  let recordNavigations = 0;
  let ownerSaves = 0;
  await store.put({
    id: 'jobs-industries:en',
    version: 1,
    fetchedAt: Date.now(),
    tree: resumeIndustriesFixture('en'),
  });
  await provider.context().route('**/profile/edit/experience/123', (route) => {
    const navigation = route.request().isNavigationRequest();
    navigation ? recordNavigations++ : recordReads++;
    const html = cvWatchWorkplaceHtml({
      description: description || 'Original description',
      secondary: true,
      secondaryChecked: !navigation && modes.membershipMismatch,
    });
    return route.fulfill({
      contentType: 'text/html',
      body:
        !navigation && modes.challenge
          ? '<input name="captcha">'
          : html.replace(
              '</body>',
              '<script>globalThis.inertRecordScriptExecuted = true;</script></body>'
            ),
    });
  });
  await provider.context().route('**/fixture/workplace', (route) => {
    description = route.request().postData();
    ownerSaves++;
    return route.fulfill({ status: 200, body: 'Saved' });
  });
  await provider.context().route('**/resume_converter/resume.txt?**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: cvWatchWorkplaceExport(description, modes.mismatch).replace(
        'Example Labs',
        new URL(route.request().url()).searchParams.get('hash') === 'russian'
          ? 'Unrelated employer retained in the other CV'
          : 'Example Labs'
      ),
    })
  );
  return {
    ...fixture,
    url,
    modes,
    counts: () => ({ recordReads, recordNavigations, ownerSaves }),
  };
};
