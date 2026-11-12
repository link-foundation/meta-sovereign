import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { hhSearchUrl } from '../jobs/options.js';
import { VacancyResumes } from './vacancy-resumes.js';
import { useResumeExports } from './resume-export-state.js';
import { ResumeExports } from './resume-exports.js';
import { useTechnologyAnalysis } from './technology-state.js';
import { VacancyTechnologies } from './vacancy-technologies.js';
import { useCvTechnologyReview } from './cv-technology-state.js';
import { useCvPreparation } from './cv-prepare-state.js';
import { CvTechnologyReview } from './cv-technology-review.js';
import { useCvSaveWatch } from './cv-watch-state.js';
import { CvSaveWatch } from './cv-watch-panel.js';
import {
  CvTranslationPanel,
  useCvTranslation,
} from './cv-translation-panel.js';

const el = React.createElement;
const settingsKey = 'meta-sovereign:vacancy-search';
const defaults = {
  query: '',
  resume: '',
  area: '',
  salary: '',
  currency: 'RUR',
  order: 'salary_desc',
  remote: false,
  browserSlot: 'jobs',
  mode: 'inherit',
  resumeLanguage: 'ru',
};
const initialSettings = () => {
  try {
    const raw = globalThis.localStorage?.getItem(settingsKey);
    const saved = raw?.length < 6000 ? JSON.parse(raw) : {};
    return {
      ...defaults,
      ...Object.fromEntries(
        Object.entries(saved).filter(
          ([key, value]) =>
            Object.hasOwn(defaults, key) &&
            typeof value === typeof defaults[key] &&
            (key !== 'resumeLanguage' || ['ru', 'en', 'any'].includes(value))
        )
      ),
    };
  } catch {
    return defaults;
  }
};
const searchInput = (values, page) => ({
  ...values,
  page,
  salary: values.salary === '' ? undefined : Number(values.salary),
  headless: values.mode === 'inherit' ? undefined : values.mode === 'headless',
});
const persistSettings = (values) => {
  try {
    globalThis.localStorage?.setItem(settingsKey, JSON.stringify(values));
  } catch {
    /* Reading does not require storage. */
  }
};

export const useVacancies = (api) => {
  const [values, setValues] = useState(initialSettings);
  const [capabilities, setCapabilities] = useState(null);
  const [stored, setStored] = useState([]);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [resumeLists, setResumeLists] = useState([]);
  useEffect(() => {
    let current = true;
    Promise.all([
      api.vacancyCapabilities(),
      api.vacancyStored(),
      api.vacancyResumesStored(),
    ])
      .then(([caps, saved, resumes]) => {
        if (!current) {
          return;
        }
        setCapabilities(caps);
        setStored(saved.entries ?? []);
        setResumeLists(resumes.lists);
        setLoaded(true);
      })
      .catch(() => {
        if (current) {
          setError('server-required');
          setLoaded(true);
        }
      });
    return () => {
      current = false;
    };
  }, [api]);
  const run = async (kind, operation) => {
    setBusy(kind);
    setError('');
    try {
      const answer = await operation();
      if (!answer || answer.ok === false || answer.code) {
        throw new Error(answer?.code ?? 'jobs-unconfirmed');
      }
      return answer;
    } catch (failure) {
      setError(
        `${kind.startsWith('technology-') ? 'jobs-technology:' : ''}${failure.code ?? failure.message}`
      );
      return null;
    } finally {
      setBusy('');
    }
  };
  const resumeExports = useResumeExports({ api, values, run });
  const technology = useTechnologyAnalysis({ api, values, run });
  const cvTechnology = useCvTechnologyReview({ api, values, run, technology });
  cvTechnology.preparation = useCvPreparation({ api, values, run });
  const cvSaveWatch = useCvSaveWatch({ api, values, run });
  const cvTranslation = useCvTranslation({ api, values, run });
  const search = (page = 0) =>
    run('search', async () => {
      const input = searchInput(values, page);
      hhSearchUrl(input);
      const answer = await api.vacancySearch(input);
      if (Array.isArray(answer?.cards)) {
        setResult({ ...answer, input: { ...values } });
        persistSettings(values);
      }
      return answer;
    });
  const readResumes = () =>
    run('resumes', async () => {
      const options = searchInput(values, 0);
      const answer = await api.vacancyResumes({
        browserSlot: options.browserSlot,
        headless: options.headless,
        resumeLanguage: options.resumeLanguage,
      });
      if (Array.isArray(answer?.entries)) {
        setResumeLists((lists) => [
          answer,
          ...lists.filter((list) => list.browserSlot !== answer.browserSlot),
        ]);
      }
      return answer;
    });
  const collect = (url, refresh = false) =>
    run('collect', async () => {
      const options = searchInput(values, 0);
      const answer = await api.vacancyCollect({
        url,
        refresh,
        browserSlot: options.browserSlot,
        headless: options.headless,
      });
      if (answer?.url === url && answer.title && answer.description) {
        setSelected(answer);
        setStored((rows) =>
          [answer, ...rows.filter((row) => row.url !== url)].slice(0, 100)
        );
      }
      return answer;
    });
  const browserValid = /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(values.browserSlot);
  let valid = false;
  try {
    hhSearchUrl(searchInput(values, 0));
    valid = browserValid;
  } catch {
    /* Keep invalid settings editable. */
  }
  return {
    values,
    setValues,
    capabilities,
    stored,
    result,
    selected,
    setSelected,
    busy:
      busy ||
      (resumeExports.job?.state === 'running' ? 'resume-export' : '') ||
      (cvTranslation.comparison?.state === 'running' ? 'cv-translate' : ''),
    resumeExports,
    technology,
    cvTechnology,
    cvSaveWatch,
    cvTranslation,
    error,
    loaded,
    valid,
    browserValid,
    search,
    collect,
    resumeLists,
    readResumes,
    selectResume: (hash) => {
      const next = { ...values, resume: hash };
      setValues(next);
      persistSettings(next);
    },
    cancel: () => run('cancel', () => api.vacancyCancel()),
  };
};

const Fields = ({ state, t }) => {
  const update = (key, value) =>
    state.setValues({ ...state.values, [key]: value });
  const choices = {
    currency: ['RUR', 'USD', 'EUR'],
    order: ['salary_desc', 'publication_time', 'relevance'],
    mode: ['inherit', 'visible', 'headless'],
    resumeLanguage: ['ru', 'en', 'any'],
  };
  return el(
    'fieldset',
    { className: 'automation-fieldset', disabled: Boolean(state.busy) },
    [
      el('legend', { key: 'legend' }, t('vacancy.settings')),
      el(
        'div',
        { key: 'fields', className: 'row' },
        Object.keys(defaults)
          .filter((key) => key !== 'remote')
          .map((key) =>
            el('label', { key, className: 'chat-form-field' }, [
              el(
                'span',
                { key: 'label', className: 'meta' },
                t(`vacancy.${key}`)
              ),
              choices[key]
                ? el(
                    'select',
                    {
                      key: 'input',
                      value: state.values[key],
                      'data-vacancy-field': key,
                      onChange: (event) => update(key, event.target.value),
                    },
                    choices[key].map((value) =>
                      el(
                        'option',
                        { key: value, value },
                        key === 'currency' ? value : t(`vacancy.${value}`)
                      )
                    )
                  )
                : el('input', {
                    key: 'input',
                    value: state.values[key],
                    type: key === 'salary' ? 'number' : 'text',
                    min: key === 'salary' ? 0 : undefined,
                    maxLength: 500,
                    'data-vacancy-field': key,
                    onChange: (event) => update(key, event.target.value),
                  }),
            ])
          )
      ),
      el('label', { key: 'remote', className: 'check' }, [
        el('input', {
          key: 'input',
          type: 'checkbox',
          checked: state.values.remote,
          'data-vacancy-field': 'remote',
          onChange: (event) => update('remote', event.target.checked),
        }),
        t('vacancy.remote'),
      ]),
    ]
  );
};
const action = (id, label, onClick, disabled) =>
  el(
    'button',
    { key: id, type: 'button', 'data-vacancy-action': id, onClick, disabled },
    label
  );

const Results = ({ state, t, idle, live }) => {
  const unchanged =
    state.result &&
    JSON.stringify(state.values) === JSON.stringify(state.result.input);
  return state.result
    ? el(
        'div',
        { key: 'results', className: 'col', 'data-vacancy-results': true },
        [
          el(
            'p',
            { key: 'page', className: 'meta' },
            t('vacancy.page', {
              page: state.result.page + 1,
              count: state.result.cards.length,
            })
          ),
          ...state.result.cards.map((card) =>
            el(
              'article',
              {
                key: card.url,
                className: 'col',
                'data-vacancy-card': card.url,
              },
              [
                el(
                  'a',
                  {
                    key: 'title',
                    href: card.url,
                    target: '_blank',
                    rel: 'noreferrer',
                  },
                  card.title
                ),
                el(
                  'span',
                  { key: 'meta', className: 'meta' },
                  [
                    card.company,
                    card.salary,
                    card.location,
                    card.responded ? t('vacancy.responded') : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                ),
                action(
                  'collect',
                  t('vacancy.collect'),
                  () => state.collect(card.url),
                  !idle || state.capabilities?.collect !== true
                ),
              ]
            )
          ),
          el('div', { key: 'pages', className: 'row' }, [
            action(
              'previous',
              t('vacancy.previous'),
              () => state.search(state.result.page - 1),
              !idle || !live || !unchanged || state.result.page === 0
            ),
            action(
              'next',
              t('vacancy.next'),
              () => state.search(state.result.nextPage),
              !idle || !live || !unchanged || state.result.nextPage === null
            ),
          ]),
        ]
      )
    : null;
};
const Snapshot = ({ state, t, idle }) => {
  const { dateTime } = useDates();
  return state.selected
    ? el(
        'article',
        {
          key: 'selected',
          className: 'col',
          'data-vacancy-snapshot': state.selected.url,
        },
        [
          el('h3', { key: 'title' }, state.selected.title),
          el(
            'p',
            { key: 'date', className: 'meta' },
            `${state.selected.company} · ${dateTime(state.selected.capturedAt)}`
          ),
          el(
            'a',
            {
              key: 'url',
              href: state.selected.url,
              target: '_blank',
              rel: 'noreferrer',
            },
            state.selected.url
          ),
          ...[
            'salary',
            'location',
            'experience',
            'employment',
            'workFormat',
            'published',
          ]
            .filter((key) => state.selected[key])
            .map((key) =>
              el(
                'p',
                { key, className: 'meta' },
                `${t(`vacancy.${key === 'salary' ? 'salaryValue' : key}`)}: ${state.selected[key]}`
              )
            ),
          el(
            'p',
            { key: 'skills', className: 'meta' },
            state.selected.skills.join(' · ')
          ),
          el(
            'pre',
            {
              key: 'description',
              style: {
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                fontFamily: 'inherit',
              },
            },
            state.selected.description
          ),
          action(
            'refresh',
            t('vacancy.refresh'),
            () => state.collect(state.selected.url, true),
            !idle || state.capabilities?.collect !== true
          ),
        ]
      )
    : null;
};

const CvEvidencePanels = ({ state, t }) =>
  el(React.Fragment, null, [
    state.cvTranslation
      ? el(CvTranslationPanel, {
          key: `translation:${state.values.browserSlot}`,
          state,
          t,
        })
      : null,
    state.cvSaveWatch
      ? el(CvSaveWatch, { key: state.values.browserSlot, state, t })
      : null,
    state.resumeExports
      ? el(ResumeExports, { key: 'exports', state, t })
      : null,
    state.technology
      ? el(VacancyTechnologies, { key: 'technology', state, t })
      : null,
    state.cvTechnology
      ? el(CvTechnologyReview, { key: 'cv-technology', state, t })
      : null,
  ]);

export const VacanciesScreen = ({ state }) => {
  const t = useT();
  const idle = !state.busy;
  const live = state.capabilities?.search === true;
  return el(
    'section',
    {
      className: 'col',
      'data-vacancies': true,
      'aria-label': t('vacancy.title'),
    },
    [
      el('h2', { key: 'title' }, t('vacancy.title')),
      el('p', { key: 'hint', className: 'meta' }, t('vacancy.hint')),
      el(Fields, { key: 'settings', state, t }),
      el(VacancyResumes, { key: 'resumes', state, t }),
      el(CvEvidencePanels, { key: 'evidence', state, t }),
      el('div', { key: 'actions', className: 'row' }, [
        action(
          'search',
          t('vacancy.search'),
          () => state.search(),
          !idle || !live || !state.valid
        ),
        action(
          'stop',
          t('vacancy.stop'),
          state.cancel,
          idle || state.busy === 'cancel'
        ),
      ]),
      !state.loaded
        ? el('p', { key: 'loading', role: 'status' }, t('vacancy.loading'))
        : !live
          ? el(
              'p',
              { key: 'offline', role: 'status' },
              t('vacancy.unavailable')
            )
          : null,
      state.busy
        ? el(
            'p',
            { key: 'busy', role: 'status' },
            t(
              state.busy.startsWith('technology-')
                ? 'technology.working'
                : 'vacancy.working'
            )
          )
        : null,
      state.error
        ? el(
            'p',
            { key: 'error', role: 'alert', 'data-vacancy-error': true },
            `${t(state.error.startsWith('jobs-technology') ? 'technology.failed' : 'vacancy.failed')} (${state.error})`
          )
        : null,
      el(Results, { key: 'results', state, t, idle, live }),
      el('h3', { key: 'stored-title' }, t('vacancy.cached')),
      ...state.stored.map((row) =>
        action(row.id, row.title, () => state.setSelected(row), !idle)
      ),
      state.loaded && !state.stored.length
        ? el('p', { key: 'empty', className: 'meta' }, t('vacancy.empty'))
        : null,
      el(Snapshot, { key: 'selected', state, t, idle }),
    ]
  );
};
export const VacanciesPanel = ({ api }) =>
  el(VacanciesScreen, { state: useVacancies(api) });
