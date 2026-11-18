import React, { useRef, useState } from 'react';
import { useCvPublication } from './cv-publication-state.js';
import { CvSnapshotPublication } from './cv-publication-panel.js';
import { useT } from './i18n.js';

/** Shared publication review for immutable documents; no provider writes occur. */
export const CvExperiencePublication = ({ api, state }) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const run = async (_operation, work) => {
    if (pending.current || state.busy) {
      return;
    }
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      return await work();
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const publication = useCvPublication({
    api,
    values: { browserSlot: 'jobs' },
    run,
  });
  return React.createElement(
    'section',
    { className: 'col', 'data-experience-publication': true },
    [
      failed
        ? React.createElement(
            'p',
            { key: 'error', role: 'alert' },
            t('cvPublish.loadError')
          )
        : null,
      React.createElement(CvSnapshotPublication, {
        key: 'review',
        publication,
        experiences: state.entries ?? [],
        browserSlot: 'jobs',
        busy: busy || state.busy,
        supported: state.catalogueConfirmed === true,
        t,
      }),
    ]
  );
};
