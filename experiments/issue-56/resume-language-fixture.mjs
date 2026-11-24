import { technologyCv, technologyFixture } from './technology-fixture.mjs';
import { resumeExportReceipt } from './resume-export-fixture.mjs';
import { resumeListFixture } from './resume-list-fixture.mjs';

/** A Russian native export deliberately has a Latin job title. */
export const resumeLanguageFixture = () => {
  const entry = resumeListFixture().entries[0];
  return technologyFixture({
    cv: { ...technologyCv(), language: 'ru', title: entry.title },
    receipt: {
      ...resumeExportReceipt(),
      title: entry.title,
      language: 'ru',
    },
  });
};
