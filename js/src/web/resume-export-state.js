import { useEffect, useRef, useState } from 'react';
import { saveUrl } from './media-src.js';

const requestKey = (slot) => `meta-sovereign:resume-export:${slot}`;
const savedId = (slot) => {
  try {
    return globalThis.localStorage?.getItem(requestKey(slot)) ?? '';
  } catch {
    return '';
  }
};
const visibleExports = (job, catalog, browserSlot) =>
  [...(job?.results ?? []), ...catalog].filter(
    (row, index, rows) =>
      row.browserSlot === browserSlot &&
      rows.findIndex(
        (entry) =>
          entry.browserSlot === row.browserSlot && entry.hash === row.hash
      ) === index
  );
export const useResumeExports = ({ api, values, run }) => {
  const [job, setJob] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [requestId, setRequestId] = useState('');
  const [statusLost, setStatusLost] = useState(false);
  const [scope, setScope] = useState('latest');
  const [formats, setFormats] = useState(['pdf', 'rtf', 'html']);
  const generation = useRef(0);
  const refresh = async () => {
    const current = generation.current;
    const answer = await api.vacancyResumeExportsStored();
    if (current === generation.current) {
      setCatalog(answer.exports);
    }
  };
  useEffect(() => {
    let current = true;
    generation.current++;
    const id = savedId(values.browserSlot);
    setRequestId(id);
    setJob(null);
    setStatusLost(Boolean(id));
    setCatalog([]);
    api
      .vacancyResumeExportsStored()
      .then((answer) => {
        if (current) {
          setCatalog(answer.exports);
        }
      })
      .catch(() => {});
    if (id) {
      api
        .vacancyResumeExportStatus({ requestId: id })
        .then((answer) => {
          if (current) {
            setJob(answer);
            setStatusLost(false);
          }
        })
        .catch(() => {
          if (current) {
            setStatusLost(true);
          }
        });
    }
    return () => {
      current = false;
      generation.current++;
    };
  }, [api, values.browserSlot]);
  useEffect(() => {
    if (job?.state !== 'running' || statusLost) {
      return undefined;
    }
    let current = true;
    let timer;
    const poll = async () => {
      try {
        const answer = await api.vacancyResumeExportStatus({
          requestId: job.requestId,
        });
        if (!current) {
          return;
        }
        setJob(answer);
        if (answer.state === 'running') {
          timer = globalThis.setTimeout(poll, 1000);
        } else {
          await refresh();
        }
      } catch {
        if (current) {
          setStatusLost(true);
        }
      }
    };
    timer = globalThis.setTimeout(poll, 250);
    return () => {
      current = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, job?.requestId, job?.state, statusLost]);
  return {
    job,
    requestId,
    statusLost,
    scope,
    setScope,
    formats,
    setFormats,
    exports: visibleExports(job, catalog, values.browserSlot),
    start: () =>
      run('resume-export', async () => {
        const id = globalThis.crypto.randomUUID();
        setJob(null);
        setRequestId(id);
        setStatusLost(true);
        try {
          globalThis.localStorage?.setItem(requestKey(values.browserSlot), id);
        } catch {
          // The in-memory request remains recoverable for this mounted view.
        }
        const answer = await api.vacancyResumeExport({
          requestId: id,
          formats,
          all: scope === 'all',
          resume: scope === 'selected' ? values.resume : undefined,
          browserSlot: values.browserSlot,
          headless:
            values.mode === 'inherit' ? undefined : values.mode === 'headless',
        });
        setJob(answer);
        setStatusLost(false);
        return answer;
      }),
    recover: () =>
      run('resume-export-recover', async () => {
        const answer = await api.vacancyResumeExportStatus({ requestId });
        setJob(answer);
        setStatusLost(false);
        await refresh();
        return answer;
      }),
    stop: () =>
      run('resume-export-cancel', async () => {
        const answer = await api.vacancyResumeExportCancel({ requestId });
        setJob(answer);
        setStatusLost(false);
        await refresh();
        return { ok: true };
      }),
    download: (result, file) =>
      run('resume-export-download', async () => {
        const url = await api.vacancyResumeExportUrl({
          ...result,
          name: file.name,
        });
        if (!url) {
          throw new Error('server-required');
        }
        await saveUrl(url, `${result.hash}-${file.name}`);
        return { ok: true };
      }),
  };
};
