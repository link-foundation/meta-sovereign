import assert from 'node:assert/strict';

export const openCvWatchOriginal = async (fixture, { before = false } = {}) => {
  const { provider } = fixture;
  const { identity } = fixture.data.sources.find(
    (row) => row.cv.language === 'en'
  );
  await fixture.open({ screen: 'list' });
  await provider.waitForFunction(() => globalThis.fixtureHydrated);
  const [response] = await Promise.all([
    before
      ? null
      : provider.waitForResponse(
          (result) =>
            result.url().includes('resume_converter/resume.txt') &&
            !result.url().includes(identity.hash),
          { timeout: 8000 }
        ),
    provider.locator('[data-qa="edit-experience-button-123"]').click(),
  ]);
  await provider.waitForFunction(() => globalThis.fixtureHydrated);
  await response?.finished();
  const roster = provider.locator(
    `[data-qa="profile-resumes-list-checkbox-${identity.hash}"]`
  );
  assert.equal(await roster.isChecked(), true);
  await roster.uncheck();
  fixture.followup.keepOriginalInExport();
  return provider.locator('[data-qa="profile-layout-save-button"]');
};
