import { useEffect, useRef, useState } from 'react';
import { cvAreaIdentity } from '../jobs/cv-workplace-dictionaries.js';
import { cvWorkplaceJobValues } from '../jobs/cv-workplace-plan.js';

export const useCvWorkplaceReview = ({ api, values, run, preparation }) => {
  const [plan, setPlan] = useState(null);
  const [source, setSource] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [dictionaries, setDictionaries] = useState(null);
  const [fields, setFields] = useState(null);
  const [recordId, setRecordId] = useState('');
  const [choice, setChoice] = useState('');
  const [loadError, setLoadError] = useState(false);
  const generation = useRef(0);
  const revision = useRef(0);
  const browserSlot = values.browserSlot;
  const load = async () => {
    const current = generation.current;
    const read = ++revision.current;
    const answer = await api.vacancyCvWorkplacePlanStored({ browserSlot });
    if (current === generation.current && read === revision.current) {
      setPlan(answer.plan);
      setLoadError(false);
    }
    return answer;
  };
  useEffect(() => {
    generation.current++;
    setPlan(null);
    setSource(null);
    setJobs([]);
    setDictionaries(null);
    setFields(null);
    setRecordId('');
    setChoice('');
    setLoadError(false);
    const current = generation.current;
    void load().catch(() => {
      if (current === generation.current) {
        setLoadError(true);
      }
    });
    return () => {
      generation.current++;
    };
  }, [api, browserSlot]);
  const accept = (answer, current) => {
    if (current === generation.current) {
      revision.current++;
      setPlan(answer.plan);
      setLoadError(false);
    }
    return answer;
  };
  return {
    plan,
    source,
    jobs,
    dictionaries,
    fields,
    recordId,
    setRecordId: (value) => {
      setRecordId(value);
      setPlan(null);
      revision.current++;
    },
    choice,
    loadError,
    choose: (value) => {
      setChoice(value);
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
          jobIndex,
        });
        const entries =
          dictionaries ?? (await api.vacancyCvWorkplaceDictionaries());
        const baseline = cvWorkplaceJobValues(
          answer.source.job,
          cvAreaIdentity(answer.source.job.area, entries)
        );
        if (current === generation.current) {
          setPlan(null);
          revision.current++;
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
            jobIndex: source.jobIndex,
            recordId,
            fields,
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
    prepare: () =>
      preparation.prepare(
        plan,
        { id: `${plan.source.identity.language}:workplace` },
        { recordId: plan.recordId, reviewKind: 'workplace' }
      ),
    reload: () => run('cv-workplace-plan-stored', load),
  };
};
