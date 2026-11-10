import React from 'react';

const previewInput = (form) => ({
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
      if (running.current === 'apply') {
        api.followTelegramCancel().catch(() => {});
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
  const request = async (action, input) => {
    if (action === 'list') {
      return api.followTelegramList({ limit: form.limit, ...input });
    }
    if (action === 'preview') {
      await dismiss(owned.current);
      owned.current = null;
      setResult(null);
      setPlan(null);
      return api.followTelegramPreview(previewInput(form));
    }
    if (action === 'apply') {
      const current = plan;
      setPlan(null);
      owned.current = null;
      return api.followTelegramApply({ planId: current.planId, confirm: true });
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
    running.current = action;
    const version = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const answer = await request(action, input);
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
      await api.followTelegramCancel();
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
    applying: running.current === 'apply',
  };
};
