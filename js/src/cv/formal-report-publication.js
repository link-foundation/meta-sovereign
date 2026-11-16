import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { formalPayloadOf } from './formal-report-content.js';
import { formalReportFailure } from './formal-report-record.js';

const key = (kind, version) =>
  `secret:cv-formal-publication:${version}:${kind}`;
const kinds = (action) => [
  ...new Set(formalPayloadOf(action.body).samples.map((sample) => sample.kind)),
];
const checked = (row, id) => {
  if (
    row &&
    (row.id !== id ||
      row.version !== 1 ||
      typeof row.requestId !== 'string' ||
      !['pending', 'published'].includes(row.state) ||
      (row.issue !== null &&
        (!Number.isSafeInteger(row.issue) || row.issue < 1)))
  ) {
    throw formalReportFailure('binding');
  }
  return row;
};

/** A pending publication also blocks a new request from silently repeating it. */
export const formalPublicationBindings = (store) => ({
  known: async (kind, version) => {
    const id = key(kind, version);
    const row = checked(await store.get(id), id);
    if (row?.state === 'pending') {
      throw formalReportFailure('prior-outcome-unknown');
    }
    return row?.issue ?? null;
  },
  pending: async (action, requestId) => {
    for (const kind of kinds(action)) {
      const id = key(kind, action.version);
      const previous = checked(await store.get(id), id);
      if (previous?.state === 'pending') {
        throw formalReportFailure('prior-outcome-unknown');
      }
      await saveAcknowledgedRecord(store, {
        id,
        version: 1,
        state: 'pending',
        issue: action.issue ?? null,
        requestId,
      });
    }
  },
  acknowledged: async (action, requestId, url) => {
    const issue = Number(new URL(url).pathname.split('/').at(-1));
    for (const kind of kinds(action)) {
      await saveAcknowledgedRecord(store, {
        id: key(kind, action.version),
        version: 1,
        state: 'published',
        issue,
        requestId,
      });
    }
  },
});
