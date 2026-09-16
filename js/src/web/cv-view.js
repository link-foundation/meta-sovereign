// CV synchronisation view (issue #29, R-V18).
//
// One screen for the whole loop the issue asks for: see every platform
// the system knows, read the live CVs through browser-commander, look
// at the differences side by side, plan a sync and — only when the
// user explicitly asks — apply it. The telemetry panel replays what
// the last runs recorded so a broken selector is visible here instead
// of only in a server log.
//
// The `api` is injected (defaulting to ./dom.js) so the screen renders
// in tests without booting the offline client.

import React, { useCallback, useEffect, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useT } from './i18n.js';

const el = React.createElement;

const fmtTs = (ts) => (ts ? new Date(ts).toLocaleString() : '');

/** `{platform: value}` → `platform=value` cells, in a stable order. */
const valueCells = (row) =>
  Object.entries(row.values ?? {}).map(
    ([platform, value]) =>
      `${platform}: ${value === '' || value === null ? '—' : JSON.stringify(value)}`
  );

const PlatformRow = ({ platform, stored, checked, onToggle }) => {
  const t = useT();
  return el('tr', { 'data-platform': platform.id }, [
    el(
      'td',
      { key: 'pick' },
      el('input', {
        type: 'checkbox',
        checked,
        'aria-label': platform.label,
        onChange: () => onToggle(platform.id),
      })
    ),
    el('td', { key: 'label' }, platform.label),
    el('td', { key: 'markup', className: 'meta' }, platform.markupAccess),
    el(
      'td',
      { key: 'confidence', className: 'meta' },
      t('cv.confidence', {
        verified: platform.confidence.verified,
        draft: platform.confidence.draft,
      })
    ),
    el(
      'td',
      { key: 'stored', className: 'meta' },
      stored ? fmtTs(stored.capturedAt) : t('cv.noSnapshot')
    ),
  ]);
};

const ComparisonTable = ({ comparison }) => {
  const t = useT();
  const rows = (comparison?.rows ?? []).filter(
    (row) => row.conflict || row.missing.length > 0
  );
  if (rows.length === 0) {
    return el('p', { className: 'meta' }, t('cv.noConflicts'));
  }
  return el('table', { className: 'cv-comparison' }, [
    el(
      'thead',
      { key: 'head' },
      el('tr', null, [
        el('th', { key: 'path' }, t('cv.field')),
        el('th', { key: 'values' }, t('cv.values')),
        el('th', { key: 'missing' }, t('cv.missing')),
      ])
    ),
    el(
      'tbody',
      { key: 'body' },
      rows.map((row) =>
        el(
          'tr',
          {
            key: row.path,
            'data-path': row.path,
            'data-conflict': String(Boolean(row.conflict)),
          },
          [
            el('td', { key: 'path' }, row.path),
            el('td', { key: 'values' }, valueCells(row).join(' · ')),
            el('td', { key: 'missing' }, (row.missing ?? []).join(', ')),
          ]
        )
      )
    ),
  ]);
};

const SyncPlan = ({ result }) => {
  const t = useT();
  if (!result) {
    return null;
  }
  return el('div', { className: 'col cv-sync-plan' }, [
    el(
      'p',
      { key: 'mode', className: 'meta', 'data-dry-run': String(result.dryRun) },
      result.dryRun ? t('cv.dryRun') : t('cv.applied')
    ),
    el(
      'ul',
      { key: 'actions' },
      (result.actions ?? []).map((action) =>
        el(
          'li',
          { key: action.platform, 'data-platform': action.platform },
          t('cv.action', {
            platform: action.platform,
            writable: action.writable,
            unsupported: action.unsupported,
            paths: action.paths.join(', ') || '—',
          })
        )
      )
    ),
  ]);
};

const TelemetryPanel = ({ telemetry }) => {
  const t = useT();
  const runs = telemetry?.runs ?? [];
  if (runs.length === 0) {
    return el('p', { className: 'meta' }, t('cv.noRuns'));
  }
  return el(
    'ul',
    { className: 'cv-telemetry' },
    runs.map((run) =>
      el('li', { key: run.runId, 'data-run-id': run.runId }, [
        el(
          'span',
          { key: 'head' },
          `${run.platform} · ${run.mode} · ${fmtTs(run.startedAt)}`
        ),
        el(
          'span',
          { key: 'counts', className: 'meta' },
          Object.entries(run.counts ?? {})
            .map(([type, count]) => `${type}=${count}`)
            .join(' ')
        ),
        ...(run.problems ?? []).map((problem, index) =>
          el(
            'span',
            { key: `p${index}`, className: 'meta cv-problem' },
            problem
          )
        ),
      ])
    )
  );
};

const Failures = ({ failures }) =>
  (failures ?? []).length === 0
    ? null
    : el(
        'ul',
        { className: 'cv-failures', role: 'alert' },
        failures.map((failure) =>
          el(
            'li',
            { key: failure.platform, 'data-platform': failure.platform },
            `${failure.platform}: ${failure.code} — ${failure.message}`
          )
        )
      );

/**
 * Shape a thrown error like the `failures` entries the API returns,
 * so one list on the screen holds both kinds of bad news. Exported
 * for `js/tests/cv-web.test.js`.
 */
export const clientFailure = (name, error) => ({
  platform: name,
  code: 'client-error',
  message: String(error?.message ?? error),
});

/** Everything the screen does, kept out of the render for clarity. */
const useCvState = (api) => {
  const [platforms, setPlatforms] = useState([]);
  const [stored, setStored] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState('');
  const [failures, setFailures] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [sync, setSync] = useState(null);
  const [telemetry, setTelemetry] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.cvPlatforms(), api.cvStored(), api.cvTelemetry({})])
      .then(([catalogue, snapshots, runs]) => {
        if (cancelled) {
          return;
        }
        const entries = snapshots.entries ?? [];
        setPlatforms(catalogue);
        setStored(entries);
        setTelemetry(runs);
        setSelected(
          entries.length > 0
            ? entries.map((entry) => entry.platform)
            : catalogue.map((platform) => platform.id)
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setFailures([clientFailure('load', error)]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const run = useCallback(async (name, fn) => {
    setBusy(name);
    setFailures([]);
    try {
      return await fn();
    } catch (error) {
      // A screen that quietly does nothing is the worst outcome when
      // something breaks, so a client-side failure is reported in the
      // same list as a platform failure instead of ending up as an
      // unhandled rejection in the console.
      setFailures([clientFailure(name, error)]);
      return null;
    } finally {
      setBusy('');
    }
  }, []);

  const toggle = useCallback(
    (id) =>
      setSelected((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id]
      ),
    []
  );

  const read = useCallback(
    (vars) =>
      run('read', async () => {
        const result = await api.cvRead({ platforms: selected, vars });
        setFailures(result.failures ?? []);
        setStored((await api.cvStored()).entries ?? []);
        setTelemetry(await api.cvTelemetry({}));
      }),
    [api, run, selected]
  );

  const compare = useCallback(
    () =>
      run('compare', async () =>
        setComparison(await api.cvCompare({ platforms: selected }))
      ),
    [api, run, selected]
  );

  const planSync = useCallback(
    (dryRun, vars) =>
      run(dryRun ? 'plan' : 'apply', async () => {
        const result = await api.cvSync({ platforms: selected, dryRun, vars });
        setSync(result);
        setFailures(result.failures ?? []);
        setTelemetry(await api.cvTelemetry({}));
      }),
    [api, run, selected]
  );

  return {
    platforms,
    stored,
    selected,
    busy,
    failures,
    comparison,
    sync,
    telemetry,
    toggle,
    read,
    compare,
    planSync,
  };
};

const button = (id, label, { disabled, onClick, className }) =>
  el(
    'button',
    {
      key: id,
      type: 'button',
      className,
      'data-action': `cv-${id}`,
      disabled,
      onClick,
    },
    label
  );

const CvControls = ({ state, login, setLogin }) => {
  const t = useT();
  const vars = login ? { login } : {};
  const idle = state.busy === '';
  const some = state.selected.length > 0;
  return el('div', { className: 'row cv-controls' }, [
    el('input', {
      key: 'login',
      value: login,
      placeholder: t('cv.loginPlaceholder'),
      'aria-label': t('cv.loginPlaceholder'),
      onChange: (event) => setLogin(event.target.value),
    }),
    button('read', t('cv.read'), {
      className: 'primary',
      disabled: !idle || !some,
      onClick: () => state.read(vars),
    }),
    button('compare', t('cv.compare'), {
      disabled: !idle,
      onClick: state.compare,
    }),
    button('plan-sync', t('cv.planSync'), {
      disabled: !idle || !some,
      onClick: () => state.planSync(true, vars),
    }),
    button('apply-sync', t('cv.applySync'), {
      className: 'danger',
      disabled: !idle || state.sync === null,
      onClick: () => state.planSync(false, vars),
    }),
  ]);
};

const CvPlatforms = ({ state }) => {
  const t = useT();
  const storedFor = (id) => state.stored.find((entry) => entry.platform === id);
  return el('table', { className: 'cv-platforms' }, [
    el(
      'thead',
      { key: 'head' },
      el('tr', null, [
        el('th', { key: 'pick' }, t('cv.use')),
        el('th', { key: 'label' }, t('cv.platform')),
        el('th', { key: 'markup' }, t('cv.markup')),
        el('th', { key: 'confidence' }, t('cv.steps')),
        el('th', { key: 'stored' }, t('cv.snapshot')),
      ])
    ),
    el(
      'tbody',
      { key: 'body' },
      state.platforms.map((platform) =>
        el(PlatformRow, {
          key: platform.id,
          platform,
          stored: storedFor(platform.id),
          checked: state.selected.includes(platform.id),
          onToggle: state.toggle,
        })
      )
    ),
  ]);
};

/**
 * The screen itself, pure: everything it shows comes from `state`.
 * Rendering it directly (see `js/tests/cv-web.test.js`) exercises the
 * whole surface without a browser, an effect loop or a server.
 */
export const CvScreen = ({ state, login = '', setLogin = () => {} }) => {
  const t = useT();
  return el('div', { className: 'col cv-view' }, [
    el('h2', { key: 'h' }, t('cv.title')),
    el('p', { key: 'intro', className: 'meta' }, t('cv.intro')),
    // An empty catalogue means the backend has no `/api/cv/*` routes
    // (the Rust server, or no server at all), which is worth saying
    // out loud rather than showing an empty table.
    state.platforms.length === 0
      ? el(
          'p',
          { key: 'unavailable', className: 'meta', 'data-cv': 'unavailable' },
          t('cv.unavailable')
        )
      : el(CvPlatforms, { key: 'platforms', state }),
    el(CvControls, { key: 'controls', state, login, setLogin }),
    state.busy
      ? el('p', { key: 'busy', className: 'meta' }, t('cv.busy'))
      : null,
    el(Failures, { key: 'failures', failures: state.failures }),
    el('h3', { key: 'cmp-h' }, t('cv.differences')),
    el(ComparisonTable, {
      key: 'cmp',
      comparison: state.comparison?.comparison ?? null,
    }),
    el('h3', { key: 'sync-h' }, t('cv.syncTitle')),
    el(SyncPlan, { key: 'sync', result: state.sync }),
    el('h3', { key: 'tel-h' }, t('cv.telemetry')),
    el(TelemetryPanel, { key: 'tel', telemetry: state.telemetry }),
  ]);
};

export const CvView = ({ api = defaultApi }) => {
  const [login, setLogin] = useState('');
  return el(CvScreen, { state: useCvState(api), login, setLogin });
};
