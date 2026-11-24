import { useEffect, useMemo, useState } from 'react';
import {
  ApplicationSession,
  applicationOwnsBatchReview,
} from './application-session.js';
import { useApplicationBatch } from './application-batch-state.js';

export const useApplication = ({ api, values, selected, run }) => {
  const session = useMemo(() => new ApplicationSession(api), [api]);
  const [state, setState] = useState(session.state);
  const [options, setOptions] = useState({
    coverLetter: '',
    autoSelectResumeLanguage: true,
    autoAnswerViewedVacancy: true,
    collectVacancies: true,
    vacancyPreviewSeconds: 3,
    applyFromVacancyPage: true,
    autoExact: false,
    autoSendExactAnswers: false,
    testMode: false,
    supervised: false,
    confirmations: ['send'],
    reviewDelayMs: 3000,
  });
  const batch = useApplicationBatch({ api, values, options, session });
  useEffect(() => {
    const unsubscribe = session.subscribe(setState);
    setState(session.state);
    if (session.state.intent) {
      void session.recover().catch(() => {});
    }
    return () => {
      unsubscribe();
      session.dispose();
    };
  }, [session]);
  useEffect(() => {
    const input = selected?.url
      ? { url: selected.url, browserSlot: values.browserSlot }
      : null;
    void session.select(input).catch(() => {});
  }, [session, selected?.url, values.browserSlot]);
  useEffect(() => {
    void session
      .refreshQueue({ browserSlot: values.browserSlot })
      .catch(() => {});
  }, [session, values.browserSlot]);
  const batchReviewRevision = applicationOwnsBatchReview(
    batch.receipt,
    state.receipt
  )
    ? batch.receipt.application.revision
    : null;
  useEffect(() => {
    // A paced batch can observe native changes after the last individual action.
    // Read the current receipt so an older batch poll cannot replace it.
    if (
      batchReviewRevision &&
      !session.state.busy &&
      batchReviewRevision !== session.state.receipt?.revision
    ) {
      void session.recover({ background: true }).catch(() => {});
    }
  }, [session, batchReviewRevision, state.busy]);
  const waiting =
    Boolean(state.receipt?.active && state.receipt?.page?.questions) ||
    ['waiting', 'refreshing', 'restoring'].includes(
      state.receipt?.limitWait?.phase
    );
  useEffect(() => {
    if (!waiting) {
      return;
    }
    let pending = false;
    const timer = globalThis.setInterval(async () => {
      if (!pending && !session.state.busy) {
        pending = true;
        try {
          await session.recover({ background: true });
          await session.refreshQueue({ browserSlot: values.browserSlot });
        } catch {
          // Status recovery stays read only; a lost response cannot restart work.
        } finally {
          pending = false;
        }
      }
    }, 1500);
    return () => globalThis.clearInterval(timer);
  }, [session, waiting, values.browserSlot]);
  const operate = (kind, action) =>
    run(`application-${kind}`, async () => {
      try {
        await action();
        return { ok: true };
      } finally {
        await session
          .refreshQueue({ browserSlot: values.browserSlot })
          .catch(() => {});
      }
    });
  return {
    ...state,
    options,
    api,
    setOptions,
    batch,
    occupied: Boolean(state.intent && (!state.known || state.receipt?.active)),
    start: () =>
      operate('open', () =>
        session.start({
          ...options,
          ...(options.applicationSearchUrl !== undefined ||
          selected?.applicationSearchUrl === undefined
            ? {}
            : { applicationSearchUrl: selected.applicationSearchUrl }),
          headless:
            values.mode === 'inherit' ? undefined : values.mode === 'headless',
        })
      ),
    recover: () => operate('status', () => session.recover()),
    reopen: () => operate('reopen', () => session.reopen()),
    release: () => operate('release', () => session.release()),
    action: (name, input) =>
      operate(name.toLowerCase(), () => session.action(name, input)),
    refreshQueue: () =>
      session.refreshQueue({ browserSlot: values.browserSlot }),
    retry: (entry) => operate('retry', () => session.retry(entry)),
    stop: () => operate('stop', () => session.stop()),
  };
};
