import {
  assignmentText,
  assignmentVacancyUrl,
} from '../assignments/validation.js';
import { jobsFailure, sameSearch } from './options.js';

export const validateVacancySearch = (read, url) => {
  if (
    !read ||
    read.challenge ||
    !sameSearch(read.url, url) ||
    !Array.isArray(read.cards) ||
    read.cards.length > 100 ||
    (!read.cards.length && read.empty !== true) ||
    read.next === false
  ) {
    throw jobsFailure(
      'search-unavailable',
      'The requested vacancy results were not readable. Check the owned browser for login or a challenge.'
    );
  }
  const seen = new Set();
  const cards = read.cards.map((card) => {
    const canonical = assignmentVacancyUrl(card.url);
    if (seen.has(canonical) || typeof card.responded !== 'boolean') {
      throw jobsFailure(
        'search-ambiguous',
        'The vacancy results have ambiguous identities.'
      );
    }
    seen.add(canonical);
    return {
      url: canonical,
      title: assignmentText(card.title, 500, 'vacancy title'),
      ...Object.fromEntries(
        ['company', 'salary', 'location'].map((key) => [
          key,
          assignmentText(card[key], 1000, key, true),
        ])
      ),
      responded: card.responded,
    };
  });
  const current = new URL(url);
  const page = Number(current.searchParams.get('page'));
  let nextPage = null;
  if (read.next !== null && read.next !== undefined) {
    const expected = new URL(url);
    expected.searchParams.set('page', String(page + 1));
    if (!sameSearch(read.next, expected.href) || page === 999) {
      throw jobsFailure(
        'search-ambiguous',
        'The next page changes the selected search.'
      );
    }
    nextPage = page + 1;
  }
  return { url, page, nextPage, cards, capturedAt: new Date().toISOString() };
};
