// The "saved by a newer version" notice (R-Z17): shown above the views when
// the page's own store came from a newer build (`ms-schema-too-new`, fired
// at start-up) or the server's health says its store is newer than this
// build understands (`schema.version > schema.current`). Nothing is
// overwritten meanwhile; the way out is updating the app, so there is no
// dismiss button.

import React, { useEffect, useState } from 'react';
import { useHealth } from './disk-banner.js';
import { useT } from './i18n.js';

const el = React.createElement;

/** Whether `/api/health` says the store is newer than this build. */
export const schemaTooNew = (health) =>
  Number.isInteger(health?.schema?.version) &&
  Number.isInteger(health?.schema?.current) &&
  health.schema.version > health.schema.current;

// True once the page's store was found newer (the event may fire before
// this mounts, so `dom.js` also leaves a flag).
const usePageStoreTooNew = () => {
  const [tooNew, setTooNew] = useState(
    () => globalThis.msSchemaTooNew === true
  );
  useEffect(() => {
    const on = () => setTooNew(true);
    globalThis.addEventListener?.('ms-schema-too-new', on);
    return () => globalThis.removeEventListener?.('ms-schema-too-new', on);
  }, []);
  return tooNew;
};

/** @param {{ api?: { health?: () => Promise<object|null> }, health?: object, tooNew?: boolean }} props `health` / `tooNew` override what is polled / heard (tests). */
export const SchemaBanner = ({ api, health: given, tooNew: heard }) => {
  const t = useT();
  const polled = useHealth(api ?? {});
  const fromPage = usePageStoreTooNew();
  if (!(heard ?? fromPage) && !schemaTooNew(given ?? polled)) {
    return null;
  }
  return el(
    'aside',
    {
      className: 'disk-banner',
      role: 'status',
      'data-banner': 'schema-too-new',
    },
    el('span', null, t('schema.tooNew'))
  );
};
