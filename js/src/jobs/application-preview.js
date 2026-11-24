import { applicationFailure as fail } from './application-options.js';

/** One native description, bound to the reviewed document and full prose. */
export const previewVacancyDocument = ({
  url,
  documentKey,
  description,
  scroll,
}) => {
  const { document, location } = globalThis;
  const current = new URL(location.href);
  const expected = new URL(url);
  const visible = (node) => {
    const style = globalThis.getComputedStyle(node);
    return (
      !node.closest('[hidden], [inert], [aria-hidden="true"]') &&
      !['hidden', 'collapse'].includes(style.visibility) &&
      style.display !== 'none' &&
      node.getClientRects().length > 0
    );
  };
  const descriptions = [
    ...document.querySelectorAll('[data-qa="vacancy-description"]'),
  ].filter(visible);
  if (
    current.origin !== expected.origin ||
    current.pathname !== expected.pathname ||
    current.username ||
    current.password ||
    document[Symbol.for('meta-sovereign.jobs.application-document.v1')] !==
      documentKey ||
    descriptions.length !== 1 ||
    descriptions[0].innerText.trim() !== description
  ) {
    return false;
  }
  if (scroll) {
    descriptions[0].scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  return true;
};

export const scrollApplicationVacancy = (browser, input) =>
  browser.commander.evaluate({ fn: previewVacancyDocument, args: [input] });

/** Stop and native changes are rechecked before any navigation or entry reservation. */
export const previewApplicationVacancy = async (service, record, signal) => {
  await service.review.check(record, 'enter', signal);
  service.salary.admit(record);
  if (!record.vacancy || record.page.scope) {
    throw fail('changed');
  }
  const input = {
    url: record.url,
    documentKey: record.page.documentKey,
    description: record.vacancy.description,
  };
  if (
    !(await service.previewVacancy(record.browser, { ...input, scroll: true }))
  ) {
    throw fail('changed');
  }
  signal.throwIfAborted();
  const delayMs = (record.options.vacancyPreviewSeconds ?? 3) * 1000;
  service.trace({ event: 'application-vacancy-preview', delayMs });
  await service.previewWait(delayMs, signal);
  signal.throwIfAborted();
  await service.review.check(record, 'enter', signal);
  service.salary.admit(record);
  if (
    !(await service.previewVacancy(record.browser, { ...input, scroll: false }))
  ) {
    throw fail('changed');
  }
  signal.throwIfAborted();
};
