import React, { useEffect, useRef, useState } from 'react';
import { parseIndented } from 'lino-objects-codec';
import { runnerSourcePin } from '../transport/runner-deployment-receipt.js';
import { useT } from './i18n.js';

const el = React.createElement;

export const runnerSourceModes = (document) => {
  if (!document) {
    return [];
  }
  try {
    const { obj } = parseIndented({ text: document });
    return ['local', 'server'].filter((mode) =>
      runnerSourcePin(obj[mode]?.applicationSource)
    );
  } catch {
    return [];
  }
};

const planValues = (plan) => [
  ['deployFrom', plan.source],
  ['deployTo', `${plan.host} · ${plan.directory}`],
  ['deployDigest', plan.sha256],
  ['deployLock', plan.applicationLock],
];

const review = (plan, t) =>
  el(
    'dl',
    { key: 'review', className: 'col', 'data-runner-source-plan': '' },
    planValues(plan).map(([key, value]) =>
      el('div', { key }, [
        el('dt', { key: 'label', className: 'meta' }, t(`runner.${key}`)),
        el(
          'dd',
          { key: 'value', style: { margin: 0, overflowWrap: 'anywhere' } },
          value
        ),
      ])
    )
  );

export const RunnerDeploymentSettings = ({
  api,
  mode,
  disabled,
  onPrepared,
}) => {
  const t = useT();
  const active = useRef(null);
  const [state, setState] = useState({});
  useEffect(() => () => active.current?.abort(), []);
  const perform = async (action) => {
    if (disabled || active.current) {
      return;
    }
    const owner = new AbortController();
    active.current = owner;
    setState({ ...state, busy: true, message: undefined });
    try {
      const result = await api.runnerDeploymentRequest(
        action,
        mode,
        state.plan?.revision,
        owner.signal
      );
      if (owner.signal.aborted) {
        return;
      }
      if (result.ok) {
        setState({
          plan: result,
          message:
            result.state === 'present'
              ? 'deployPresent'
              : result.state === 'prepared'
                ? 'deployPrepared'
                : undefined,
        });
        if (result.state) {
          onPrepared?.();
        }
      } else {
        const changed = result.code === 'runner-source-plan-changed';
        setState({
          plan: changed ? undefined : state.plan,
          message: changed ? 'deployChanged' : 'deployUnavailable',
        });
      }
    } catch {
      if (!owner.signal.aborted) {
        setState({ plan: state.plan, message: 'deployUnavailable' });
      }
    } finally {
      active.current = null;
    }
  };
  const locked = disabled || state.busy;
  return el(
    'div',
    {
      className: 'col',
      'data-runner-deployment': mode,
      'aria-busy': Boolean(state.busy),
    },
    [
      el('h4', { key: 'mode' }, t(`runner.${mode}`)),
      el(
        'button',
        {
          key: 'preview',
          type: 'button',
          disabled: locked,
          'data-runner-deploy-review': '',
          onClick: () => void perform('deploy-plan'),
        },
        t('runner.deployReview')
      ),
      state.plan ? review(state.plan, t) : null,
      state.plan && !state.plan.state
        ? el(
            'button',
            {
              key: 'prepare',
              type: 'button',
              disabled: locked,
              'data-runner-deploy-prepare': '',
              onClick: () => void perform('deploy'),
            },
            t('runner.deployPrepare')
          )
        : null,
      state.busy || state.message
        ? el(
            'p',
            { key: 'status', role: 'status', 'data-runner-deploy-status': '' },
            t(`runner.${state.busy ? 'deployPending' : state.message}`)
          )
        : null,
    ]
  );
};
