import { resumeHash } from './resume-list.js';
import { cvPrepareFailure } from './cv-prepare-record.js';
const cvWorkplaceFail = (code) => {
  throw cvPrepareFailure(code);
};

/** A deselection preserves the record and every other CV, including unchecked rows. */
export const cvWorkplaceMembership = (rows, hash) => {
  resumeHash(hash);
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) {
    cvWorkplaceFail('membership');
  }
  const before = rows
    .map((row) => {
      resumeHash(row?.hash);
      if (typeof row.checked !== 'boolean' || Object.keys(row).length !== 2) {
        cvWorkplaceFail('membership');
      }
      return { hash: row.hash, checked: row.checked };
    })
    .sort((a, b) => a.hash.localeCompare(b.hash));
  if (
    new Set(before.map((row) => row.hash)).size !== before.length ||
    !before.some((row) => row.hash === hash && row.checked) ||
    !before.some((row) => row.hash !== hash && row.checked)
  ) {
    cvWorkplaceFail('membership');
  }
  return {
    before,
    after: before.map((row) =>
      row.hash === hash ? { ...row, checked: false } : row
    ),
  };
};

export const sameCvMembership = (a, b) => {
  const sorted = (rows) =>
    [...rows].sort((x, y) => x.hash.localeCompare(y.hash));
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
};
