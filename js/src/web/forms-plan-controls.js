import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
const errorKey = (code) =>
  [
    'form-report',
    'answer-profile-missing',
    'form-stopped',
    'server-required',
  ].includes(code)
    ? code
    : 'form-plan-failed';

const useProfiles = (api, probe) => {
  const [profiles, setProfiles] = useState(null);
  useEffect(() => {
    let current = true;
    setProfiles(null);
    Promise.resolve()
      .then(() => api.answerProfiles())
      .then(
        (values) => {
          if (current) {
            setProfiles(values);
          }
        },
        () => {
          if (current) {
            setProfiles(false);
          }
        }
      );
    return () => {
      current = false;
    };
  }, [api, probe]);
  return profiles;
};

export const FormPlanControls = ({
  api,
  report,
  available,
  busy,
  setBusy,
  onPlan,
}) => {
  const t = useT();
  const [profileId, setProfileId] = useState('');
  const [approximate, setApproximate] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [probe, setProbe] = useState(0);
  const profiles = useProfiles(api, probe);
  const changed = (setter, value) => {
    setter(value);
    setError(null);
    onPlan(null);
  };
  const plan = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setLoading(true);
    setError(null);
    try {
      const value = report.reviewSession
        ? await api.formsPlanReview({
            id: report.reviewSession.id,
            profileId,
            approximate,
          })
        : await api.formsPlan({ inspection: report, profileId, approximate });
      if (!value?.ok || value.mode !== 'answer-plan') {
        setError(value?.code ?? 'form-plan-failed');
      } else {
        onPlan(value);
      }
    } catch (failure) {
      setError(failure.code ?? 'form-plan-failed');
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };
  return el('section', { className: 'card col', 'data-form-planner': '' }, [
    el('h2', { key: 'title' }, t('forms.plan.title')),
    el('p', { key: 'hint', className: 'meta' }, t('forms.plan.hint')),
    el('label', { key: 'profile', className: 'col' }, [
      t('forms.plan.profile'),
      el(
        'select',
        {
          key: 'select',
          value: profileId,
          disabled: busy || !profiles,
          'data-form-profile': '',
          onChange: (event) => changed(setProfileId, event.target.value),
        },
        [
          el('option', { key: 'none', value: '' }, t('forms.plan.savedOnly')),
          ...(profiles || []).map((profile) =>
            el('option', { key: profile.id, value: profile.id }, profile.name)
          ),
        ]
      ),
    ]),
    el(
      'button',
      {
        key: 'reload',
        type: 'button',
        disabled: busy || profiles === null,
        'data-action': 'reload-form-profiles',
        onClick: () => {
          changed(setProfileId, '');
          setProbe((n) => n + 1);
        },
      },
      t('forms.plan.reloadProfiles')
    ),
    profiles === null
      ? el(
          'p',
          { key: 'loading', role: 'status' },
          t('forms.plan.profilesLoading')
        )
      : null,
    profiles === false
      ? el('div', { key: 'failed', role: 'alert' }, [
          el('p', { key: 'error' }, t('forms.plan.profilesFailed')),
          el(
            'button',
            {
              key: 'retry',
              type: 'button',
              disabled: busy,
              onClick: () => setProbe((n) => n + 1),
            },
            t('forms.retry')
          ),
        ])
      : null,
    el('label', { key: 'approximate', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked: approximate,
        disabled: busy,
        onChange: (event) => changed(setApproximate, event.target.checked),
      }),
      t('forms.plan.approximate'),
    ]),
    el(
      'button',
      {
        key: 'plan',
        type: 'button',
        disabled: busy || !available,
        'data-action': 'plan-form',
        'aria-busy': loading,
        onClick: plan,
      },
      t(loading ? 'forms.plan.planning' : 'forms.plan.action')
    ),
    error
      ? el(
          'p',
          { key: 'error', role: 'alert', 'data-form-plan-error': error },
          t(`forms.plan.error.${errorKey(error)}`)
        )
      : null,
  ]);
};
