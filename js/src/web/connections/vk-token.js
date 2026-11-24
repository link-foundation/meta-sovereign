import React, { useEffect, useRef, useState } from 'react';
import { api as defaultApi } from '../dom.js';
import { useT } from '../i18n.js';
import {
  isVkTokenStatus,
  isVkTokenRefusal,
} from '../../transport/vk-token-status.js';

const el = React.createElement;
const pending = (value) => ['waiting', 'validating'].includes(value?.state);

const useVkToken = (api) => {
  const [answer, setAnswer] = useState(null);
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [refusal, setRefusal] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const owner = useRef(null);
  const read = async (signal) => {
    const version = generation.current;
    const result = await api.vkTokenStatus(signal);
    if (!isVkTokenStatus(result)) {
      throw new Error('VK authorization status unavailable');
    }
    if (!signal.aborted && version === generation.current) {
      setAnswer(result);
      setError(false);
      setAttempt(0);
    }
    return result;
  };
  useEffect(() => {
    const controller = new AbortController();
    owner.current = controller;
    void read(controller.signal).catch(() => {
      if (!controller.signal.aborted) {
        setError(true);
        setAttempt((count) => count + 1);
      }
    });
    return () => controller.abort();
  }, [api]);
  useEffect(() => {
    if ((!pending(answer) && attempt === 0) || attempt >= 3) {
      return undefined;
    }
    const timer = globalThis.setTimeout(
      () => {
        void read(owner.current.signal).catch(() => {
          if (!owner.current.signal.aborted) {
            setError(true);
            setAttempt((count) => count + 1);
          }
        });
      },
      Math.min(4000, 1000 * 2 ** attempt)
    );
    return () => globalThis.clearTimeout(timer);
  }, [answer, attempt]);
  const act = async (action) => {
    if (busy || owner.current?.signal.aborted) {
      return;
    }
    setBusy(true);
    setRefusal(null);
    generation.current++;
    setConfirm(false);
    setError(false);
    const signal = owner.current.signal;
    const input = action === 'cancel' ? { id: answer.id } : { confirm };
    if (action === 'import') {
      input.value = value;
      setValue('');
    }
    try {
      const result =
        action === 'refresh'
          ? await read(signal)
          : await api.vkTokenAction(action, input, signal);
      if (isVkTokenRefusal(result)) {
        if (!signal.aborted) {
          setRefusal(result.code);
        }
        return;
      }
      if (!isVkTokenStatus(result)) {
        throw new Error('VK authorization was not confirmed');
      }
      if (!signal.aborted) {
        setAnswer(result);
        setAttempt(0);
      }
    } catch {
      if (!signal.aborted) {
        setError(true);
        setAttempt(1);
      }
    } finally {
      if (!signal.aborted) {
        setBusy(false);
      }
    }
  };
  return {
    answer,
    value,
    setValue,
    confirm,
    setConfirm,
    busy,
    error,
    refusal,
    act,
  };
};

const stateName = (answer, error) =>
  answer?.state ?? (error ? 'unavailable' : 'loading');

const VkTokenStatus = ({ answer, error, refusal }) => {
  const t = useT();
  return el(React.Fragment, null, [
    answer && !answer.capabilities.protectedStorage
      ? el('p', { key: 'protected', role: 'status' }, t('vkToken.protected'))
      : null,
    answer && !answer.capabilities.authorize
      ? el('p', { key: 'desktop', className: 'meta' }, t('vkToken.desktop'))
      : null,
    el(
      'p',
      {
        key: 'status',
        role: 'status',
        'data-vk-token-state': stateName(answer, error),
      },
      t(`vkToken.${refusal ?? answer?.code ?? stateName(answer, error)}`)
    ),
    answer?.state === 'saved'
      ? el(
          'p',
          { key: 'identity', 'data-vk-token-identity': '' },
          t('vkToken.identity', {
            id: answer.identity.id,
            name: answer.identity.name,
          })
        )
      : null,
    error
      ? el('p', { key: 'error', role: 'alert' }, t('vkToken.failedRead'))
      : null,
  ]);
};

export const VkToken = ({ api = defaultApi }) => {
  const t = useT();
  const state = useVkToken(api);
  const { answer, busy } = state;
  const running = pending(answer);
  const ready =
    answer?.capabilities.protectedStorage && !running && !busy && !state.error;
  const button = (name, disabled) =>
    el(
      'button',
      {
        key: name,
        type: 'button',
        disabled,
        'data-vk-token-action': name,
        onClick: () => void state.act(name),
      },
      t(`vkToken.${name}`)
    );
  return el(
    'section',
    { className: 'col', 'data-vk-token': '', 'aria-busy': busy },
    [
      el('h3', { key: 'title' }, t('vkToken.title')),
      el('p', { key: 'hint', className: 'meta' }, t('vkToken.hint')),
      el(VkTokenStatus, {
        key: 'state',
        answer,
        error: state.error,
        refusal: state.refusal,
      }),
      el('label', { key: 'value', className: 'col' }, [
        el('span', { key: 'label' }, t('vkToken.value')),
        el('input', {
          key: 'input',
          type: 'password',
          autoComplete: 'off',
          value: state.value,
          disabled: !ready,
          'data-vk-token-value': '',
          onChange: (event) => state.setValue(event.target.value),
        }),
      ]),
      el('label', { key: 'confirm', className: 'row' }, [
        el('input', {
          key: 'input',
          type: 'checkbox',
          checked: state.confirm,
          disabled: !ready,
          'data-vk-token-confirm': '',
          onChange: (event) => state.setConfirm(event.target.checked),
        }),
        t('vkToken.confirm'),
      ]),
      el(
        'div',
        {
          key: 'actions',
          className: 'row',
          style: { flexWrap: 'wrap', gap: 'var(--gap, 12px)' },
        },
        [
          button(
            'start',
            !ready || !state.confirm || !answer?.capabilities.authorize
          ),
          button('import', !ready || !state.confirm || !state.value.trim()),
          button('cancel', !running || busy),
          button('refresh', busy),
        ]
      ),
    ]
  );
};
