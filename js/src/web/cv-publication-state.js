import { useEffect, useRef, useState } from 'react';

export const useCvPublication = ({ api, values, run }) => {
  const browserSlot = values.browserSlot;
  const [receipt, setReceipt] = useState(null);
  const [repository, setRepository] = useState('');
  const [remote, setRemote] = useState('origin');
  const [directory, setDirectory] = useState('examples/cv-snapshots');
  const [consent, setConsent] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const generation = useRef(0);
  const apply = (current, answer) => {
    if (current === generation.current) {
      setReceipt(answer.publication);
      setConsent(false);
      setLoadError(false);
    }
    return answer;
  };
  const load = async (current) => {
    try {
      const answer = await api.vacancyCvPublishStatus({ browserSlot });
      if (current === generation.current && answer.publication) {
        setRepository(answer.publication.repository);
        setRemote(answer.publication.remote);
        setDirectory(answer.publication.directory);
      }
      return apply(current, answer);
    } catch (error) {
      if (current === generation.current) {
        setLoadError(true);
        setConsent(false);
      }
      throw error;
    }
  };
  useEffect(() => {
    const current = ++generation.current;
    setReceipt(null);
    setRepository('');
    setRemote('origin');
    setDirectory('examples/cv-snapshots');
    setConsent(false);
    setLoadError(false);
    void load(current).catch(() => {});
    return () => {
      generation.current++;
    };
  }, [api, browserSlot]);
  const edit = (setter) => (value) => {
    generation.current++;
    setConsent(false);
    setter(value);
  };
  return {
    receipt,
    repository,
    remote,
    directory,
    consent,
    loadError,
    setRepository: edit(setRepository),
    setRemote: edit(setRemote),
    setDirectory: edit(setDirectory),
    setConsent,
    reload: () => run('cv-publish-status', () => load(++generation.current)),
    plan: (hash) =>
      run('cv-publish-plan', async () => {
        const current = ++generation.current;
        setConsent(false);
        const answer = await api.vacancyCvPublishPlan({
          browserSlot,
          repository,
          remote,
          directory,
          resumes: [hash],
          requestId: globalThis.crypto.randomUUID(),
        });
        if (current === generation.current) {
          setRepository(answer.publication.repository);
        }
        return apply(current, answer);
      }),
    publish: () =>
      run('cv-publish', async () => {
        if (!consent || receipt?.state !== 'planned') {
          throw new Error('jobs-cv-publication-unverified');
        }
        const current = ++generation.current;
        setConsent(false);
        try {
          return apply(
            current,
            await api.vacancyCvPublish({
              browserSlot,
              requestId: receipt.requestId,
              confirmation: receipt.confirmation,
              publish: true,
            })
          );
        } catch (error) {
          if (current === generation.current) {
            setLoadError(true);
          }
          throw error;
        }
      }),
  };
};
