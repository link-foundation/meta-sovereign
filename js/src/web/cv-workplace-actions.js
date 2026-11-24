import { cvAreaIdentity } from '../jobs/cv-workplace-dictionaries.js';
import {
  blankCvWorkplaceValues,
  cvWorkplaceJobValues,
} from '../jobs/cv-workplace-plan.js';
import { cvWorkplaceUsesMembership } from '../jobs/cv-workplace-membership.js';

export const createCvWorkplaceActions = ({
  api,
  run,
  preparation,
  browserSlot,
  generation,
  revision,
  load,
  accept,
  plan,
  operation,
  membership,
  source,
  dictionaries,
  fields,
  recordId,
  choice,
  setOperation,
  setMembership,
  setPlan,
  setSource,
  setJobs,
  setFields,
  setDictionaries,
  setRecordId,
  setChoice,
}) => {
  const adding = operation === 'add';
  return {
    setOperation: (value) => {
      if (adding !== (value === 'add')) {
        setSource(null);
        setJobs([]);
        setFields(null);
        setRecordId('');
      }
      setOperation(value);
      setMembership(null);
      setPlan(null);
      revision.current++;
    },
    loadMembership: () =>
      run('cv-workplace-membership', async () => {
        const current = generation.current;
        const read = ++revision.current;
        setMembership(null);
        const answer = await api.vacancyCvWorkplaceMembership({
          browserSlot,
          exportId: source.identity.exportId,
          hash: source.identity.hash,
          jobIndex: source.jobIndex,
          recordId,
          ...(operation === 'copy' ? { operation } : {}),
        });
        if (current === generation.current && read === revision.current) {
          setMembership(answer.membership);
        }
        return answer;
      }),
    setRecordId: (value) => {
      setRecordId(value);
      setMembership(null);
      setPlan(null);
      revision.current++;
    },
    choose: (value) => {
      setChoice(value);
      setMembership(null);
      setSource(null);
      setFields(null);
      setJobs([]);
      setPlan(null);
      revision.current++;
    },
    update: (key, value) => {
      setFields((old) => ({ ...old, [key]: value }));
      setPlan(null);
      revision.current++;
    },
    loadSource: (exports, jobIndex = 0) =>
      run('cv-workplace-source', async () => {
        const current = generation.current;
        const read = ++revision.current;
        const selected = exports.find(
          (item) =>
            `${item.exportId}:${item.hash}` === choice &&
            item.browserSlot === browserSlot
        );
        if (!selected) {
          throw new Error('jobs-cv-options');
        }
        const answer = await api.vacancyCvWorkplaceSource({
          browserSlot,
          exportId: selected.exportId,
          hash: selected.hash,
          ...(adding ? { operation } : { jobIndex }),
        });
        const entries =
          dictionaries ?? (await api.vacancyCvWorkplaceDictionaries());
        const baseline = adding
          ? blankCvWorkplaceValues()
          : cvWorkplaceJobValues(
              answer.source.job,
              cvAreaIdentity(answer.source.job.area, entries)
            );
        if (current === generation.current && read === revision.current) {
          setPlan(null);
          setMembership(null);
          setSource(answer.source);
          setJobs(answer.jobs);
          setFields(baseline);
          setDictionaries(entries);
        }
        return answer;
      }),
    propose: () =>
      run('cv-workplace-plan', async () => {
        const current = generation.current;
        return accept(
          await api.vacancyCvWorkplacePlan({
            browserSlot,
            exportId: source.identity.exportId,
            hash: source.identity.hash,
            ...(adding
              ? { operation }
              : { jobIndex: source.jobIndex, recordId }),
            fields: operation === 'detach' ? {} : fields,
            ...(cvWorkplaceUsesMembership(operation)
              ? { operation, resumes: membership.resumes }
              : {}),
          }),
          current
        );
      }),
    approve: () =>
      run('cv-workplace-review', async () => {
        const current = generation.current;
        return accept(
          await api.vacancyCvWorkplaceReview({
            browserSlot,
            fingerprint: plan.fingerprint,
          }),
          current
        );
      }),
    prepare: () => preparation.prepareWorkplace(plan),
    reload: () => run('cv-workplace-plan-stored', load),
  };
};
