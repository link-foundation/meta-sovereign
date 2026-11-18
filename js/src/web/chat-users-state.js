import { useEffect, useRef, useState } from 'react';

export const usersRunning = (job) =>
  ['running', 'cancelling'].includes(job?.state);
export const useChatUsersCapability = (api, chat) => {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    setAvailable(false);
    if (
      chat?.source === 'telegram' &&
      typeof api?.telegramStatus === 'function' &&
      typeof api.telegramChatUsersStart === 'function'
    ) {
      api
        .telegramStatus()
        .then((status) => {
          if (live) {
            setAvailable(
              status?.kind === 'user' &&
                status?.capabilities?.chatUsersStart === true
            );
          }
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [api, chat?.source, chat?.chat]);
  return available;
};
const downloadReport = (report) => {
  const url = URL.createObjectURL(
    new globalThis.Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    })
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `telegram-${report.job.kind}-${report.job.id}.json`;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const fullReport = async (api, id) => {
  const users = [];
  const results = [];
  let offset = 0;
  for (;;) {
    const page = await api.telegramChatUsersStatus({ offset, limit: 500 });
    if (!page.ok || page.job?.id !== id) {
      throw new Error('scan-changed');
    }
    users.push(...page.users);
    results.push(...page.results);
    if (!page.more) {
      return { job: page.job, users, results };
    }
    const count = page.users.length + page.results.length;
    if (!count || offset + count > 100_000) {
      throw new Error('invalid-page');
    }
    offset += count;
  }
};
export const useChatUsers = (api, chat) => {
  const [data, setData] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const state = useRef({ live: false, busy: false, revision: 0, offset: 0 });
  useEffect(() => {
    const s = state.current;
    s.live = true;
    const read = async () => {
      if (s.busy) {
        return;
      }
      const revision = s.revision;
      try {
        const answer = await api.telegramChatUsersStatus({ offset: s.offset });
        if (s.live && revision === s.revision) {
          if (answer.ok) {
            setData(answer);
          } else {
            setError(answer.code ?? 'failed');
          }
        }
      } catch {
        if (s.live && revision === s.revision) {
          setError('offline');
        }
      }
    };
    read();
    const timer = globalThis.setInterval(read, 1500);
    return () => {
      s.live = false;
      s.revision += 1;
      globalThis.clearInterval(timer);
    };
  }, [api, chat.chat]);
  const request = async (use) => {
    const s = state.current;
    if (s.busy) {
      return null;
    }
    s.busy = true;
    s.revision += 1;
    const revision = s.revision;
    setBusy(true);
    setError(null);
    try {
      const answer = await use();
      if (!s.live || revision !== s.revision) {
        return null;
      }
      if (!answer?.ok) {
        setError(answer?.code ?? 'failed');
        return null;
      }
      return answer;
    } catch {
      if (s.live && revision === s.revision) {
        setError('offline');
      }
      return null;
    } finally {
      s.busy = false;
      if (s.live) {
        setBusy(false);
      }
    }
  };
  const action = async (method, body) => {
    setPlan(null);
    const answer = await request(() => api[method](body));
    if (answer?.job) {
      state.current.offset = 0;
      setData({ ...answer, users: [], results: [] });
    }
  };
  return {
    data,
    plan,
    busy,
    error,
    clearPlan: () => setPlan(null),
    action,
    page: async (offset) => {
      const answer = await request(() =>
        api.telegramChatUsersStatus({ offset })
      );
      if (answer) {
        state.current.offset = offset;
        setData(answer);
      }
    },
    preview: async (options) => {
      setPlan(null);
      const answer = await request(() =>
        api.telegramChatUsersContactsPreview({
          ...options,
          jobId: data?.job?.id,
        })
      );
      if (answer) {
        setPlan(answer);
      }
    },
    download: async () => {
      const answer = await request(async () => ({
        ok: true,
        report: await fullReport(api, data.job.id),
      }));
      if (answer) {
        downloadReport(answer.report);
      }
    },
  };
};
