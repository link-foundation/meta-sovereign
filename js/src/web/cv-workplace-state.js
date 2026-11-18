import { useEffect, useRef, useState } from 'react';
import { createCvWorkplaceActions } from './cv-workplace-actions.js';

export const useCvWorkplaceReview = ({ api, values, run, preparation }) => {
  const [operation, setOperation] = useState('update');
  const [membership, setMembership] = useState(null);
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
      setOperation(answer.plan?.operation ?? 'update');
      setMembership(
        answer.plan?.membership
          ? { resumes: answer.plan.membership.before }
          : null
      );
      setLoadError(false);
    }
    return answer;
  };
  useEffect(() => {
    generation.current++;
    setPlan(null);
    setMembership(null);
    setOperation('update');
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
    operation,
    membership,
    source,
    jobs,
    dictionaries,
    fields,
    recordId,
    choice,
    loadError,
    ...createCvWorkplaceActions({
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
    }),
  };
};
