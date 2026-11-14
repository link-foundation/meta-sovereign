import { useEffect, useRef, useState } from 'react';
import {
  defaultTechnologyEntries,
  technologyCatalogEntries,
} from '../jobs/technology-catalog.js';

export const useTechnologyAnalysis = ({ api, values, run }) => {
  const [catalog, setCatalog] = useState(null);
  const [draft, setDraft] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [selection, setSelection] = useState('');
  const [loadError, setLoadError] = useState(false);
  const generation = useRef(0);
  const browserSlot = values.browserSlot;
  const load = async (current) => {
    const results = await Promise.allSettled([
      api.vacancyTechnologyCatalog(),
      api.vacancyTechnologyAnalysisStored({ browserSlot }),
    ]);
    if (current !== generation.current) {
      return;
    }
    if (results[0].status === 'fulfilled') {
      setCatalog(results[0].value);
      setDraft(results[0].value.entries);
    }
    if (results[1].status === 'fulfilled') {
      setAnalysis(results[1].value.analysis);
    }
    setLoadError(results.some((result) => result.status === 'rejected'));
  };
  useEffect(() => {
    const current = ++generation.current;
    setCatalog(null);
    setDraft([]);
    setAnalysis(null);
    setSelection('');
    setLoadError(false);
    void load(current);
    return () => {
      generation.current++;
    };
  }, [api, browserSlot]);
  const save = () =>
    run('technology-save', async () => {
      const current = generation.current;
      const answer = await api.vacancyTechnologyCatalogSave({
        revision: catalog.revision,
        entries: technologyCatalogEntries(draft),
      });
      if (current === generation.current) {
        setCatalog(answer);
        setDraft(answer.entries);
      }
      return answer;
    });
  const analyze = (exports) =>
    run('technology-analyze', async () => {
      const current = generation.current;
      const selected = exports.find(
        (row) => `${row.exportId}:${row.hash}` === selection
      );
      if (!selected || selected.browserSlot !== browserSlot) {
        throw new Error('jobs-technology-resume');
      }
      const answer = await api.vacancyTechnologyAnalyze({
        browserSlot,
        exportId: selected.exportId,
        hash: selected.hash,
        revision: catalog.revision,
      });
      if (current === generation.current) {
        setAnalysis(answer.analysis);
      }
      return answer;
    });
  return {
    catalog,
    draft,
    setDraft,
    analysis,
    selection,
    setSelection,
    loadError,
    save,
    analyze,
    dirty: Boolean(
      catalog && JSON.stringify(draft) !== JSON.stringify(catalog.entries)
    ),
    defaults: () => setDraft(defaultTechnologyEntries()),
    reload: () =>
      run('technology-reload', async () => {
        await load(++generation.current);
        return { loaded: true };
      }),
  };
};
