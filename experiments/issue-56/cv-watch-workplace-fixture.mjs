import { resumeCvFixture, resumeExportHtml } from './resume-export-fixture.mjs';

const escaped = (text) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', '<br>');
export const cvWatchWorkplaceHtml = ({
  description = 'Original description',
  secondary = false,
  secondaryChecked = false,
} = {}) => `<!doctype html><html lang="en"><body>
  <h1>Owner workplace editor fixture</h1>
  <input name="company" value="Example Labs"><input name="position" value="Engineer">
  <textarea data-qa="resume-editor-experience-description-input">${escaped(description).replaceAll('<br>', '\n')}</textarea>
  <div data-qa="resume-editor-experience-start-month-input"><span data-qa="trigger-values-wrapper">May</span></div>
  <input data-qa="resume-editor-experience-start-year-input" value="2020">
  <input type="checkbox" data-qa="resume-editor-experience-present-checkbox" checked>
  <div data-qa="resume-editor-experience-area-input"><span data-qa="trigger-values-wrapper">Remote</span></div>
  <input data-qa="resume-editor-experience-company-url-input" value="https://example.test/">
  <div data-qa="trigger-root"><label>Field of activity</label><span data-qa="trigger-values-wrapper">Software</span></div>
  <input type="checkbox" data-qa="profile-resumes-list-checkbox-abc123" checked>
  ${secondary ? `<input type="checkbox" data-qa="profile-resumes-list-checkbox-russian" ${secondaryChecked ? 'checked' : ''}>` : ''}
  <button data-qa="profile-layout-save-button">Save workplace</button>
  <button data-qa="profile-layout-cancel-button">Cancel</button>
  <script>document.querySelector('[data-qa="profile-layout-save-button"]').onclick=async()=>{
    await fetch('/fixture/workplace',{method:'POST',body:document.querySelector('textarea').value});
    location.href='/resume/abc123';
  };</script></body></html>`;

export const cvWatchWorkplaceExport = (description, mismatch) =>
  resumeExportHtml()
    .replace(
      escaped(resumeCvFixture().jobs[0].description),
      escaped(description)
    )
    .replace(
      'https://web.archive.org/web/20200101000000/https://example.test/',
      mismatch ? 'https://different.test/' : 'https://example.test/'
    );
