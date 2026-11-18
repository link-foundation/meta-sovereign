import React from 'react';

const defaults = {
  source: 'vk',
  chats: '',
  backlink: '',
  monitorMs: '200000',
  intervalMs: '30000',
  delayMs: '0',
  deleteIncoming: false,
  autoFollow: false,
  maxRetries: '10',
  maxLinks: '100',
  joinDelayMs: '1000',
  followMute: true,
  followArchive: true,
  historyLimit: '200',
  attempts: '3',
  retryDelayMs: '100',
  retryMaxDelayMs: '2000',
};
const inputOf = (form) => ({
  source: form.source,
  chats: form.chats
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  backlink: form.backlink,
  ...Object.fromEntries(
    ['monitorMs', 'intervalMs', 'delayMs', 'historyLimit'].map((key) => [
      key,
      Number(form[key]),
    ])
  ),
  deleteIncoming: form.deleteIncoming,
  ...(form.autoFollow
    ? {
        autoFollow: {
          maxRetries: Number(form.maxRetries),
          maxLinks: Number(form.maxLinks),
          joinDelayMs: Number(form.joinDelayMs),
          ...(form.backlink
            .trim()
            .toLowerCase()
            .startsWith('https://vk.me/join/')
            ? { mute: false, archive: false }
            : { mute: form.followMute, archive: form.followArchive }),
        },
      }
    : {}),
  retry: {
    attempts: Number(form.attempts),
    delayMs: Number(form.retryDelayMs),
    maxDelayMs: Number(form.retryMaxDelayMs),
  },
});

export const useFollowBacklink = (api) => {
  const [form, setForm] = React.useState(defaults);
  const [plan, setPlan] = React.useState(null);
  const [job, setJob] = React.useState(null);
  const [history, setHistory] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const running = React.useRef(false);
  const owned = React.useRef(null);
  const generation = React.useRef(0);
  const dismiss = (planId) =>
    planId
      ? api.followBacklinkCancel({ planId }).catch(() => {})
      : Promise.resolve();
  React.useEffect(
    () => () => {
      generation.current += 1;
      dismiss(owned.current);
      if (running.current?.action === 'preview') {
        api
          .followBacklinkCancel({ requestId: running.current.requestId })
          .catch(() => {});
      }
    },
    [api]
  );
  React.useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) {
      return undefined;
    }
    let stopped = false;
    const timer = globalThis.setTimeout(async () => {
      try {
        const next = await api.followBacklinkStatus({ jobId: job.id });
        if (!stopped) {
          setJob(next);
        }
      } catch (e) {
        if (!stopped) {
          setError(e);
        }
      }
    }, 2000);
    return () => {
      stopped = true;
      globalThis.clearTimeout(timer);
    };
  }, [api, job]);
  const change = (key, value) => {
    if (running.current) {
      return;
    }
    generation.current += 1;
    dismiss(owned.current);
    owned.current = null;
    setPlan(null);
    setForm((before) => ({ ...before, [key]: value }));
    setError(null);
  };
  const request = async (action, id, requestId) => {
    if (action === 'preview') {
      await dismiss(owned.current);
      owned.current = null;
      setPlan(null);
      return api.followBacklinkPreview({ ...inputOf(form), requestId });
    }
    if (action === 'apply') {
      const planId = owned.current;
      owned.current = null;
      setPlan(null);
      return api.followBacklinkApply({ planId, confirm: true });
    }
    if (action === 'list') {
      return api.followBacklinkList({ limit: 20, offset: id ?? 0 });
    }
    if (action === 'resume') {
      return api.followBacklinkResume({ jobId: job.id, confirm: true });
    }
    if (action === 'cancel') {
      await api.followBacklinkCancel({ jobId: job.id });
    }
    return api.followBacklinkStatus({ jobId: id ?? job.id });
  };
  const perform = async (action, id) => {
    if (running.current || (action === 'apply' && !owned.current)) {
      return;
    }
    const version = generation.current;
    const requestId = globalThis.crypto.randomUUID();
    running.current = { action, requestId };
    setBusy(true);
    setError(null);
    try {
      const answer = await request(action, id, requestId);
      if (version === generation.current) {
        if (action === 'preview') {
          owned.current = answer.planId;
          setPlan(answer);
        } else if (action === 'list') {
          setHistory(answer);
        } else {
          setJob(answer);
        }
      } else if (action === 'preview') {
        dismiss(answer.planId);
      }
    } catch (e) {
      if (version === generation.current) {
        setError(e);
      }
    } finally {
      running.current = false;
      if (version === generation.current) {
        setBusy(false);
      }
    }
  };
  const stopPreview = async () => {
    if (running.current?.action !== 'preview') {
      return;
    }
    try {
      await api.followBacklinkCancel({ requestId: running.current.requestId });
    } catch {
      setError({ code: 'cancel-failed' });
    }
  };
  return {
    form,
    plan,
    job,
    history,
    error,
    busy,
    change,
    perform,
    stopPreview,
    previewing: running.current?.action === 'preview',
  };
};
