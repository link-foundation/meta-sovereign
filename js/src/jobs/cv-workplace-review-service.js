import { attachCvWatchBrowser } from './cv-watch-browser.js';
import { inspectNativeCvWorkplace } from './cv-workplace-edit-native.js';
import { cvWorkplaceMatchesJob } from './cv-watch-verification.js';
import { cvWorkplaceMembership } from './cv-workplace-membership.js';
import { browserName } from '../browser/policy.js';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { verifiedTechnologyCv } from './technology-cv.js';
import {
  storedCvWorkplacePlan,
  saveCvWorkplacePlan,
} from './cv-workplace-plan-storage.js';
import { saveTechnologyRecord } from './technology-storage.js';
import {
  cvWorkplaceFields,
  cvWorkplaceValues,
  cvWorkplaceJobValues,
  cvWorkplaceRecordId,
  cvWorkplacePlanDifferences,
  cvWorkplacePlanJob,
  cvWorkplaceFail,
  fingerprintCvWorkplacePlan,
} from './cv-workplace-plan.js';
import {
  loadCvWorkplaceDictionaries,
  cvAreaIdentity,
  cvLocalizedEntry,
} from './cv-workplace-dictionaries.js';

const currentSource = async (options, plan) => {
  const source = await verifiedTechnologyCv(options, plan.source.identity);
  if (
    (await modelFingerprint({
      identity: source.identity,
      jobIndex: plan.source.jobIndex,
      job: source.cv.jobs[plan.source.jobIndex],
    })) !== (await modelFingerprint(plan.source))
  ) {
    cvWorkplaceFail('conflict');
  }
};
/** The exact original export is checked again immediately before browser admission. */
export const cvWorkplacePreparationSource = async (options, input) => {
  const { plan } = await storedCvWorkplacePlan(options.store, input);
  if (
    !plan ||
    plan.status !== 'reviewed' ||
    input.changeId !== `${plan.source.identity.language}:workplace`
  ) {
    cvWorkplaceFail('conflict');
  }
  await currentSource(options, plan);
  return {
    id: input.changeId,
    field: 'workplace',
    language: plan.source.identity.language,
    hash: plan.source.identity.hash,
    workplace: { recordId: plan.recordId, job: plan.source.job },
    plan,
  };
};
const propose = async (options, input, signal) => {
  const browserSlot = browserName(input.browserSlot ?? 'jobs');
  cvWorkplaceRecordId(input.recordId);
  if (
    !Number.isInteger(input.jobIndex) ||
    input.jobIndex < 0 ||
    input.jobIndex > 199 ||
    !input.fields ||
    Object.keys(input.fields).some((key) => !cvWorkplaceFields.includes(key))
  ) {
    cvWorkplaceFail('options');
  }
  const source = await verifiedTechnologyCv(options, { ...input, browserSlot });
  const job = source.cv.jobs[input.jobIndex];
  if (!job) {
    cvWorkplaceFail('options');
  }
  const dictionaries = await loadCvWorkplaceDictionaries({
    store: options.store,
    signal,
  });
  const baseline = cvWorkplaceJobValues(
    job,
    cvAreaIdentity(job.area, dictionaries)
  );
  if (input.operation !== undefined && input.operation !== 'detach') {
    cvWorkplaceFail('options');
  }
  if (input.operation === 'detach' && Object.keys(input.fields).length) {
    cvWorkplaceFail('options');
  }
  const desired = cvWorkplaceValues({ ...baseline, ...input.fields });
  const metadata = Object.fromEntries(
    [
      ['areas', [baseline.areaId, desired.areaId].filter(Boolean)],
      ['industries', [...baseline.industryIds, ...desired.industryIds]],
    ].map(([kind, ids]) => [
      kind,
      [...new Set(ids)]
        .sort()
        .map((id) => cvLocalizedEntry(dictionaries[kind], id)),
    ])
  );
  const content = {
    version: 1,
    browserSlot,
    recordId: input.recordId,
    source: { identity: source.identity, jobIndex: input.jobIndex, job },
    baseline,
    desired,
    metadata,
    ...(input.operation === 'detach'
      ? {
          operation: 'detach',
          membership: cvWorkplaceMembership(
            input.resumes,
            source.identity.hash
          ),
        }
      : {}),
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  const plan = await fingerprintCvWorkplacePlan({
    ...content,
    changes: cvWorkplacePlanDifferences(content),
  });
  signal.throwIfAborted();
  return saveCvWorkplacePlan(options.store, plan);
};
export const createCvWorkplaceReviewService = ({
  store,
  artifactRoot,
  write,
  read,
  attach = attachCvWatchBrowser,
}) => {
  const options = { store, artifactRoot };
  return {
    'cv-workplace-membership': (input) =>
      write(async (signal) => {
        const recordId = cvWorkplaceRecordId(input.recordId);
        const source = await verifiedTechnologyCv(options, input);
        if (
          !Number.isInteger(input.jobIndex) ||
          !source.cv.jobs[input.jobIndex]
        ) {
          cvWorkplaceFail('options');
        }
        const dictionaries = await loadCvWorkplaceDictionaries({
          store,
          signal,
        });
        const job = source.cv.jobs[input.jobIndex];
        const baseline = cvWorkplaceJobValues(
          job,
          cvAreaIdentity(job.area, dictionaries)
        );
        const metadata = {
          areas: baseline.areaId
            ? [cvLocalizedEntry(dictionaries.areas, baseline.areaId)]
            : [],
          industries: baseline.industryIds.map((id) =>
            cvLocalizedEntry(dictionaries.industries, id)
          ),
        };
        let session;
        try {
          signal.throwIfAborted();
          session = await attach({
            browserSlot: source.identity.browserSlot,
            targetId: input.targetId,
          });
          const form = await inspectNativeCvWorkplace({
            session,
            recordId,
            check: () => signal.throwIfAborted(),
          });
          if (
            !cvWorkplaceMatchesJob(
              form,
              cvWorkplacePlanJob(
                { baseline, metadata },
                'baseline',
                form.locale
              ),
              metadata.industries.map((row) => ({
                id: row.id,
                ...row[form.locale],
              }))
            )
          ) {
            cvWorkplaceFail('baseline');
          }
          const membership = cvWorkplaceMembership(
            form.resumes,
            source.identity.hash
          );
          signal.throwIfAborted();
          return {
            membership: {
              recordId,
              source: {
                identity: source.identity,
                jobIndex: input.jobIndex,
                job,
              },
              resumes: membership.before,
              observedAt: new Date().toISOString(),
            },
          };
        } finally {
          await session?.detach();
        }
      }),
    'cv-workplace-source': (input) =>
      read(async () => {
        const jobIndex =
          input.jobIndex === undefined ? 0 : Number(input.jobIndex);
        const data = await verifiedTechnologyCv(options, input);
        if (
          !Number.isInteger(jobIndex) ||
          jobIndex < 0 ||
          !data.cv.jobs[jobIndex]
        ) {
          cvWorkplaceFail('options');
        }
        return {
          source: {
            identity: data.identity,
            jobIndex,
            job: data.cv.jobs[jobIndex],
          },
          jobs: data.cv.jobs.map(({ company, position }, index) => ({
            index,
            company,
            position,
          })),
        };
      }),
    'cv-workplace-dictionaries': () =>
      write((signal) => loadCvWorkplaceDictionaries({ store, signal })),
    'cv-workplace-plan': (input) =>
      write((signal) => propose(options, input, signal)),
    'cv-workplace-plan-stored': (input) =>
      read(() => storedCvWorkplacePlan(store, input)),
    'cv-workplace-review': (input) =>
      write(async (signal) => {
        const { plan } = await storedCvWorkplacePlan(store, input);
        if (!plan) {
          cvWorkplaceFail('conflict');
        }
        if (plan.status === 'reviewed') {
          return { plan };
        }
        const approvalId = `jobs-cv-workplace-approval:${plan.fingerprint}`;
        const previous = await store.get(approvalId);
        if (previous) {
          const answer = await storedCvWorkplacePlan(store, {
            browserSlot: plan.browserSlot,
            fingerprint: previous.fingerprint,
          });
          if (
            previous.id !== approvalId ||
            previous.version !== 1 ||
            answer.plan?.status !== 'reviewed' ||
            answer.plan.previousFingerprint !== plan.fingerprint
          ) {
            cvWorkplaceFail('conflict');
          }
          return answer;
        }
        await currentSource(options, plan);
        const { fingerprint: _old, ...content } = plan;
        const reviewed = await fingerprintCvWorkplacePlan({
          ...content,
          status: 'reviewed',
          previousFingerprint: plan.fingerprint,
          reviewedAt: new Date().toISOString(),
        });
        signal.throwIfAborted();
        const answer = await saveCvWorkplacePlan(store, reviewed);
        await saveTechnologyRecord(store, {
          id: approvalId,
          version: 1,
          fingerprint: reviewed.fingerprint,
        });
        return answer;
      }),
  };
};
