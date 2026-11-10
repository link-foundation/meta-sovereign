import React from 'react';
import {
  initialFollowReadForm,
  followReadFormPolicy,
} from './follow-read-controls.js';

const previewInput = (form) => ({
  retry: followReadFormPolicy(form),
  target: form.target,
  operation: form.operation,
  ...(form.operation === 'leave'
    ? {}
    : Object.fromEntries(
        ['mute', 'archive'].map((key) => [
          key,
          form[key] === '' ? null : form[key] === 'true',
        ])
      )),
});
export const useFollowTelegram = (api) => {
  const [form, setForm] = React.useState({
    ...initialFollowReadForm,
    target: '',
    operation: 'join',
    mute: 'true',
    archive: 'true',
    limit: '40',
  });
  const [page, setPage] = React.useState(null);
  const [plan, setPlan] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const running = React.useRef(null);
  const generation = React.useRef(0);
  const owned = React.useRef(null);
  const dismiss = (id) =>
    id
      ? api.followTelegramCancel({ planId: id }).catch(() => {})
      : Promise.resolve();
  React.useEffect(
    () => () => {
      generation.current++;
      dismiss(owned.current);
      if (running.current) {
        api
          .followTelegramCancel({ requestId: running.current.requestId })
          .catch(() => {});
      }
    },
    [api]
  );
  const change = (key, value) => {
    if (running.current) {
      return;
    }
    generation.current++;
    dismiss(owned.current);
    owned.current = null;
    setForm((before) => ({ ...before, [key]: value }));
    setPlan(null);
    setResult(null);
    setError('');
  };
  const request = async (action, input, requestId) => {
    if (action === 'list') {
      return api.followTelegramList({
        limit: form.limit,
        retry: followReadFormPolicy(form),
        ...input,
        requestId,
      });
    }
    if (action === 'preview') {
      await dismiss(owned.current);
      owned.current = null;
      setResult(null);
      setPlan(null);
      return api.followTelegramPreview({ ...previewInput(form), requestId });
    }
    if (action === 'apply') {
      const current = plan;
      setPlan(null);
      owned.current = null;
      return api.followTelegramApply({
        planId: current.planId,
        confirm: true,
        requestId,
      });
    }
    const answer = await api.followTelegramCancel({ planId: owned.current });
    owned.current = null;
    setPlan(null);
    return answer;
  };
  const receive = (action, answer) => {
    if (action === 'apply') {
      setResult(answer);
    } else if (!answer.ok) {
      setError(answer.code ?? 'failed');
    } else if (action === 'list') {
      setPage(answer);
    } else if (action === 'preview') {
      owned.current = answer.planId;
      setPlan(answer);
    }
  };
  const perform = async (action, input = {}) => {
    if (running.current) {
      return;
    }
    const requestId = globalThis.crypto.randomUUID();
    running.current = { action, requestId };
    const version = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const answer = await request(action, input, requestId);
      if (version !== generation.current) {
        if (action === 'preview') {
          dismiss(answer.planId);
        }
        return;
      }
      receive(action, answer);
    } catch (cause) {
      if (version === generation.current) {
        setError(
          action === 'apply' ? 'outcome-unknown' : (cause?.code ?? 'failed')
        );
      }
    } finally {
      running.current = null;
      if (version === generation.current) {
        setBusy(false);
      }
    }
  };
  const stop = async () => {
    try {
      await api.followTelegramCancel({ requestId: running.current?.requestId });
    } catch {
      setError('cancel-failed');
    }
  };
  return {
    form,
    change,
    page,
    plan,
    result,
    error,
    busy,
    perform,
    stop,
    applying: running.current?.action === 'apply',
  };
};
