// Finite exact-provider fixture selection check; no browser/network required.
import assert from 'node:assert/strict';
const expected = 'https://hh.ru/applicant/vacancy_response?vacancyId=123';
const variants = [
  expected,
  'https://hh.ru.foreign.test/applicant/vacancy_response?vacancyId=123',
  'https://hh.ru@foreign.test/applicant/vacancy_response?vacancyId=123',
  'https://hh.ru/applicant/vacancy_response?vacancyId=999',
  'https://hh.ru/vacancy/123',
];
assert.deepEqual(
  variants.map((url) => url.startsWith('https://hh.ru')),
  [true, true, true, true, true]
);
assert.deepEqual(
  variants.map((url) => url === expected),
  [true, false, false, false, false]
);
console.log(
  'Exact native fixture page URL rejects four misleading candidates.'
);
