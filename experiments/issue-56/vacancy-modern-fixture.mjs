import {
  vacancyMetadataHtml,
  vacancyMetadataFixture,
} from './vacancy-metadata-fixture.mjs';

export const publicationText =
  'Вакансия опубликована 13 ноября 2026 в Ташкенте';
export const publicationHtml =
  'Вакансия опубликована <time datetime="2026-11-13T12:44:03.686Z">13 ноября 2026</time> в <!-- -->Ташкенте';
const employmentHtml =
  '<div data-qa="common-employment-text"><div><span><dl><dt style="position:absolute;clip-path:inset(50%)">Тип занятости</dt><dd>Полная занятость</dd></dl></span></div></div>';

/** Synthetic provider markup uses the publicly observed structural selectors. */
export const vacancyModernHtml = (mode = 'modern') => {
  let employment = employmentHtml;
  let publication = `<div>${publicationHtml}</div>`;
  if (mode === 'legacy') {
    employment = '<p data-qa="vacancy-view-employment-mode">Full time</p>';
    publication = '<p data-qa="vacancy-creation-time">16 November 2026</p>';
  }
  if (mode === 'equivalent') {
    employment +=
      '<p data-qa="vacancy-view-employment-mode">Полная занятость</p>';
    publication = `<div data-qa="vacancy-creation-time">${publicationHtml}</div>`;
  }
  if (mode === 'employment-conflict') {
    employment += '<p data-qa="vacancy-view-employment-mode">Part time</p>';
  }
  if (mode === 'employment-oversized') {
    employment = employment.replace('Полная занятость', 'x'.repeat(1001));
  }
  if (mode === 'publication-conflict') {
    publication +=
      '<p data-qa="vacancy-creation-time">A different publication</p>';
  }
  if (mode === 'date-conflict') {
    publication += publication.replace('12:44:03.686Z', '14:44:03.686Z');
  }
  if (mode === 'date-missing' || mode === 'date-invalid') {
    publication = publication.replace(
      'datetime="2026-11-13T12:44:03.686Z"',
      mode === 'date-missing' ? '' : 'datetime="not-a-date"'
    );
  }
  if (mode === 'publication-oversized') {
    publication = publication.replace('Ташкенте', 'x'.repeat(1001));
  }
  if (mode === 'too-many-dates') {
    publication += '<time>Other date</time>'.repeat(101);
  }
  if (mode === 'none') {
    publication = '';
    employment = '';
  }
  const decoys = `<div hidden>${publicationHtml}</div>
    <article data-qa="vacancy-serp__vacancy">${publicationHtml}</article>
    <form>${publicationHtml}</form><div contenteditable="true">${publicationHtml}</div>
    <div>Company created <time datetime="2020-01-01T00:00:00Z">2020</time></div>`;
  return vacancyMetadataHtml()
    .replace(
      '<p data-qa="vacancy-view-employment-mode">Full time</p>',
      employment
    )
    .replace(
      '<p data-qa="vacancy-creation-time">16 November 2026</p>',
      publication + decoys
    )
    .replace(
      'Final employer paragraph.</div>',
      `Final employer paragraph.<p>${publicationHtml}</p></div>`
    );
};

export const vacancyModernFixture = (browser) =>
  vacancyMetadataFixture(browser, { render: vacancyModernHtml });
