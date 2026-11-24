import { resumeListFixture } from './resume-list-fixture.mjs';

export const applicationResumeChooserFixture = () => ({
  title: 'Старое резюме',
  open: false,
  disabled: false,
  ambiguous: false,
  options: [],
});
export const applicationResumeOptions = () => [
  {
    hash: 'russian-old',
    title: 'Старое резюме',
    checked: true,
    disabled: false,
  },
  {
    hash: 'english',
    title: resumeListFixture().entries[0].title,
    checked: false,
    disabled: false,
  },
];
