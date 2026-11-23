import { attachCvWatchBrowser } from './cv-watch-browser.js';
import { inspectNativeCvWorkplace } from './cv-workplace-edit-native.js';
import { readCvSavedWorkplace } from './cv-workplace-readback.js';
import { cvWorkplaceMatchesJob } from './cv-watch-verification.js';
import {
  cvWorkplaceMembership,
  cvWorkplaceUsesMembership,
} from './cv-workplace-membership.js';
import { browserName } from '../browser/policy.js';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { verifiedTechnologyCv } from './technology-cv.js';
import {
  storedCvWorkplacePlan,
  saveCvWorkplacePlan,
} from './cv-workplace-plan-storage.js';
import { saveTechnologyRecord } from './technology-storage.js';
import {
  blankCvWorkplaceValues,
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
import {
  confirmCurrentExperienceWorkplaces,
  cvWorkplaceExperienceFields,
  cvWorkplaceExperienceSource,
} from './cv-workplace-experience.js';

const cvWorkplaceSource = (data, jobIndex) => ({
  identity: data.identity,
  jobIndex,
  job: jobIndex === null ? null : data.cv.jobs[jobIndex],
});

const currentSource = async (options, plan) => {
  const source = await verifiedTechnologyCv(options, plan.source.identity);
  if (
    (await modelFingerprint(
      cvWorkplaceSource(source, plan.source.jobIndex)
    )) !== (await modelFingerprint(plan.source))
  ) {
    cvWorkplaceFail('conflict');
  }
  if (plan.experience) {
    await confirmCurrentExperienceWorkplaces(options, source);
  }
};
const preparationSourceForPlan = async (options, input, plan) => {
  if (
    !plan ||
    plan.status !== 'reviewed' ||
    (plan.operation === 'add') !== (input.operation === 'add') ||
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
/** The exact original export is checked again immediately before browser admission. */
export const cvWorkplacePreparationSource = async (options, input) => {
  const { plan } = await storedCvWorkplacePlan(options.store, input);
  return preparationSourceForPlan(options, input, plan);
};

export const hhExperienceWorkplacePreparationSource = async (
  options,
  input
) => {
  const { plan } = await storedCvWorkplacePlan(options.store, input);
  if (!plan?.experience || ![undefined, 'add'].includes(plan.operation)) {
    cvWorkplaceFail('conflict');
  }
  return preparationSourceForPlan(
    options,
    {
      operation: plan.operation,
      changeId: `${plan.source.identity.language}:workplace`,
    },
    plan
  );
};
const propose = async (options, input, signal, derived = {}) => {
  const browserSlot = browserName(input.browserSlot ?? 'jobs');
  const adding = input.operation === 'add';
  if (!adding) {
    cvWorkplaceRecordId(input.recordId);
  }
  if (
    (adding
      ? input.jobIndex !== undefined ||
        input.recordId !== undefined ||
        input.resumes !== undefined
      : !Number.isInteger(input.jobIndex) ||
        input.jobIndex < 0 ||
        input.jobIndex > 199) ||
    (input.operation !== undefined &&
      !adding &&
      !cvWorkplaceUsesMembership(input.operation)) ||
    !input.fields ||
    typeof input.fields !== 'object' ||
    Array.isArray(input.fields) ||
    Object.keys(input.fields).some((key) => !cvWorkplaceFields.includes(key)) ||
    (input.operation === 'detach' && Object.keys(input.fields).length)
  ) {
    cvWorkplaceFail('options');
  }
  const data =
    derived.data ??
    (await verifiedTechnologyCv(options, { ...input, browserSlot }));
  const source = cvWorkplaceSource(data, adding ? null : input.jobIndex);
  if (!adding && !source.job) {
    cvWorkplaceFail('options');
  }
  const dictionaries =
    derived.dictionaries ??
    (await loadCvWorkplaceDictionaries({
      store: options.store,
      signal,
    }));
  const baseline = adding
    ? blankCvWorkplaceValues()
    : cvWorkplaceJobValues(
        source.job,
        cvAreaIdentity(source.job.area, dictionaries)
      );
  const desired = cvWorkplaceValues(
    adding ? input.fields : { ...baseline, ...input.fields }
  );
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
    recordId: adding ? null : input.recordId,
    source,
    baseline,
    desired,
    metadata,
    ...(derived.experience ? { experience: derived.experience } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
    ...(cvWorkplaceUsesMembership(input.operation)
      ? {
          membership: cvWorkplaceMembership(
            input.resumes,
            source.identity.hash,
            input.operation
          ),
        }
      : {}),
    status: 'draft',
    createdAt: derived.createdAt ?? new Date().toISOString(),
  };
  const changes = cvWorkplacePlanDifferences(content);
  if (derived.experience && !changes.length) {
    cvWorkplaceFail('experience-note');
  }
  const plan = await fingerprintCvWorkplacePlan({
    ...content,
    changes,
  });
  signal.throwIfAborted();
  return saveCvWorkplacePlan(options.store, plan);
};
const proposeExperience = async (options, input, signal) => {
  const { data, job, recordId, createdAt, reference } =
    await cvWorkplaceExperienceSource(options, input);
  const dictionaries = await loadCvWorkplaceDictionaries({
    store: options.store,
    signal,
  });
  const { fields, unapplied } = cvWorkplaceExperienceFields(job, dictionaries);
  const proposal =
    job.kind === 'add'
      ? { operation: 'add', fields: { ...blankCvWorkplaceValues(), ...fields } }
      : { jobIndex: job.targetIndex, recordId, fields };
  return propose(
    options,
    { ...proposal, browserSlot: data.identity.browserSlot },
    signal,
    {
      data,
      dictionaries,
      createdAt,
      experience: { ...reference, unapplied },
    }
  );
};
const inspectMembership = async ({ options, input, signal, attach }) => {
  const { store } = options;
  const recordId = cvWorkplaceRecordId(input.recordId);
  const source = await verifiedTechnologyCv(options, input);
  if (!Number.isInteger(input.jobIndex) || !source.cv.jobs[input.jobIndex]) {
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
    const check = () => signal.throwIfAborted();
    const form =
      input.operation === 'copy'
        ? await readCvSavedWorkplace({ session, attempt: { recordId }, check })
        : await inspectNativeCvWorkplace({
            session,
            recordId,
            hash: source.identity.hash,
            check,
          });
    if (
      !cvWorkplaceMatchesJob(
        form,
        cvWorkplacePlanJob({ baseline, metadata }, 'baseline', form.locale),
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
      write((signal) => inspectMembership({ options, input, signal, attach })),
    'cv-workplace-source': (input) =>
      read(async () => {
        const data = await verifiedTechnologyCv(options, input);
        if (input.operation === 'add') {
          if (input.jobIndex !== undefined || input.recordId !== undefined) {
            cvWorkplaceFail('options');
          }
          return { source: cvWorkplaceSource(data, null), jobs: [] };
        }
        const jobIndex =
          input.jobIndex === undefined ? 0 : Number(input.jobIndex);
        if (
          !Number.isInteger(jobIndex) ||
          jobIndex < 0 ||
          !data.cv.jobs[jobIndex]
        ) {
          cvWorkplaceFail('options');
        }
        return {
          source: cvWorkplaceSource(data, jobIndex),
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
      write((signal) =>
        input.experience === undefined
          ? propose(options, input, signal)
          : proposeExperience(options, input, signal)
      ),
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
        const approvalId = `${plan.experience ? 'secret:' : ''}jobs-cv-workplace-approval:${plan.fingerprint}`;
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
