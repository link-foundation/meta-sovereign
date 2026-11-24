import { PrivateCvJob } from './private-job.js';
import { readExperiencePlan } from './experience-plan-service.js';
import { experienceFormalReportPreview } from './formal-report-content.js';
import { createFormalReportGithub } from './formal-report-github.js';
import {
  planFormalReports,
  checkFormalReportTarget,
} from './formal-report-plan.js';
import { formalPublicationBindings } from './formal-report-publication.js';
import { formalReportUrl } from './formal-report-shape.js';
import {
  formalReportOptions,
  formalReportKey,
  formalReportFailure,
  newFormalReport,
  checkedFormalReport,
  formalReportView,
} from './formal-report-record.js';

const owners = new WeakMap();
export const previewFormalExperienceReport = async (store, { planRequestId }) =>
  experienceFormalReportPreview(
    await readExperiencePlan(store, { requestId: planRequestId })
  );
const checkedPreview = async (store, options) => {
  const preview = await previewFormalExperienceReport(store, options);
  if (preview.fingerprint !== options.review) {
    throw formalReportFailure('review');
  }
  return preview;
};
const acknowledgedUrl = (answer, action) => {
  const url = answer?.html_url;
  if (
    !formalReportUrl(url, action.issue) ||
    (action.issue && !url.includes('#issuecomment-')) ||
    (action.comment && !url.endsWith(`#issuecomment-${action.comment}`)) ||
    answer.body !== action.body
  ) {
    throw formalReportFailure('upstream-receipt');
  }
  return url;
};
const workFor = (store, github) => async (owned, save) => {
  const signal = owned.controller.signal;
  const bindings = formalPublicationBindings(store);
  try {
    const preview = await checkedPreview(store, owned.row.options);
    signal.throwIfAborted();
    if (owned.row.options.mode !== 'off') {
      const actions = await planFormalReports(
        github,
        preview,
        signal,
        bindings.known
      );
      await save({ actions });
      for (const [index, action] of actions.entries()) {
        signal.throwIfAborted();
        let result = {
          operation: action.operation,
          url: action.url ?? null,
          state: 'dry-run',
        };
        if (action.operation === 'already-reported') {
          result.state = 'already-reported';
        } else if (owned.row.options.mode === 'publish') {
          await checkFormalReportTarget(github, action, signal);
          // A durable pending intent makes any lost acknowledgement non-replayable.
          await save({ phase: 'publishing', pending: index });
          await bindings.pending(action, owned.row.requestId);
          signal.throwIfAborted();
          result = {
            operation: action.operation,
            state: 'published',
            url: acknowledgedUrl(await github.write(action, signal), action),
          };
          await bindings.acknowledged(action, owned.row.requestId, result.url);
        }
        await save({ pending: null, results: [...owned.row.results, result] });
      }
    }
    signal.throwIfAborted();
    await save({ phase: 'completed' });
  } catch (error) {
    await save({
      phase:
        owned.row.pending !== null
          ? 'unknown'
          : signal.aborted
            ? 'stopped'
            : 'failed',
      code:
        owned.row.pending !== null
          ? 'cv-formal-report-outcome-unknown'
          : /^cv-formal-report-[a-z-]+$/u.test(error.code ?? '')
            ? error.code
            : 'cv-formal-report-unavailable',
    });
  }
};

/** Preview and recovery never publish; one acknowledged request owns every write. */
export const createFormalExperienceReports = ({
  store,
  github = createFormalReportGithub(),
}) => {
  if (!owners.has(store)) {
    const service = new PrivateCvJob({
      store,
      key: formalReportKey,
      failure: formalReportFailure,
      optionsFor: async (input) => {
        const options = formalReportOptions(input);
        await checkedPreview(store, options);
        return options;
      },
      newRecord: newFormalReport,
      checked: checkedFormalReport,
      view: formalReportView,
      work: workFor(store, github),
    });
    owners.set(store, service.controls());
  }
  return owners.get(store);
};
export const readFormalExperienceReport = async (store, { requestId }) =>
  formalReportView(
    checkedFormalReport(await store.get(formalReportKey(requestId)), requestId),
    false
  );
