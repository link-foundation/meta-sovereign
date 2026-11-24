import { exportTarget } from '../sources/telegram-export-target.js';
const running = (job) => ['running', 'cancelling'].includes(job?.state);
const supports = (api, status) =>
  status?.kind === 'user' &&
  status.capabilities?.chatUsersGreetingsStart === true &&
  [
    'telegramChatUsersGreetingsStart',
    'telegramChatUsersGreetingsPreview',
    'telegramChatUsersGreetingsApply',
    'telegramChatUsersStatus',
    'telegramChatUsersCancel',
  ].every((key) => typeof api[key] === 'function');
const checked = (answer) => {
  if (!answer?.ok) {
    throw Object.assign(new Error('group-greeting'), {
      code: answer?.code ?? 'offline',
    });
  }
  return answer;
};
const initialState = () => ({
  availability: 'loading',
  busy: false,
  error: null,
  data: null,
  plan: null,
  uncertain: false,
  uncertainPlan: null,
  draft: {
    chat: '',
    participantsLimit: 10_000,
    limit: 20,
    delayMs: 30_000,
    sticker: null,
  },
});
const unavailable = () => ({
  availability: 'unavailable',
  data: null,
  plan: null,
});
const ownsScan = (state) => {
  const job = state.data?.job;
  const chat = exportTarget(state.draft.chat);
  return (
    job?.kind === 'scan' &&
    job.state === 'done' &&
    job.options.greetingGroup === true &&
    (chat === job.chat || chat === job.selector)
  );
};
const loadedState = (state, data) => ({
  availability: 'ready',
  data,
  ...(state.uncertainPlan && data.job?.planId === state.uncertainPlan
    ? { uncertain: false, uncertainPlan: null }
    : {}),
  ...(state.plan && state.plan.scanId !== data.job?.id ? { plan: null } : {}),
});
export const createGroupGreetingModel = (api, changed = () => {}) => {
  const state = initialState();
  let live = false;
  let epoch = 0;
  const perform = async (use) => {
    if (!live || state.busy) {
      return false;
    }
    const version = epoch;
    state.busy = true;
    state.error = null;
    changed();
    try {
      const patch = await use();
      if (live && version === epoch) {
        Object.assign(state, patch);
      }
      return live && version === epoch;
    } catch (error) {
      if (live && version === epoch) {
        state.error = error.code ?? 'offline';
      }
      return false;
    } finally {
      if (live && version === epoch) {
        state.busy = false;
        changed();
      }
    }
  };
  const available = async () => supports(api, await api.telegramStatus?.());
  const load = () =>
    perform(async () => {
      if (!(await available())) {
        return unavailable();
      }
      const data = checked(await api.telegramChatUsersStatus({ limit: 100 }));
      return loadedState(state, data);
    });
  const ownScan = () => ownsScan(state);
  const update = (patch) => {
    if (state.busy) {
      return;
    }
    state.draft = { ...state.draft, ...patch };
    state.plan = null;
    state.error = null;
    changed();
  };
  const scan = () =>
    perform(async () => {
      state.plan = null;
      if (!(await available())) {
        return unavailable();
      }
      const answer = checked(
        await api.telegramChatUsersGreetingsStart({
          chat: state.draft.chat,
          participantsLimit: state.draft.participantsLimit,
        })
      );
      return {
        data: { ...answer, users: [], results: [] },
        availability: 'ready',
      };
    });
  const preview = () => {
    if (!ownScan()) {
      return Promise.resolve(false);
    }
    return perform(async () => {
      state.plan = null;
      if (!(await available())) {
        return unavailable();
      }
      const { limit, delayMs, sticker } = state.draft;
      const plan = checked(
        await api.telegramChatUsersGreetingsPreview({
          jobId: state.data.job.id,
          limit,
          delayMs,
          sticker,
        })
      );
      return { plan, availability: 'ready' };
    });
  };
  const apply = () => {
    const plan = state.plan;
    if (!plan?.selected || state.busy) {
      return Promise.resolve(false);
    }
    return perform(async () => {
      state.plan = null;
      changed();
      let answer;
      try {
        answer = await api.telegramChatUsersGreetingsApply({
          planId: plan.planId,
          confirm: true,
        });
      } catch {
        return { uncertain: true, uncertainPlan: plan.planId };
      }
      checked(answer);
      return {
        data: { ...answer, users: [], results: [] },
        uncertain: false,
        uncertainPlan: null,
      };
    });
  };
  const cancel = () =>
    perform(async () => {
      state.plan = null;
      const answer = checked(await api.telegramChatUsersCancel());
      return { data: { ...state.data, job: answer.job } };
    });
  return {
    state,
    load,
    poll: () =>
      running(state.data?.job) || state.uncertain
        ? load()
        : Promise.resolve(false),
    update,
    scan,
    preview,
    apply,
    cancel,
    ownScan,
    running: () => running(state.data?.job),
    start: () => {
      live = true;
      epoch += 1;
      state.busy = false;
      return load();
    },
    stop: () => {
      live = false;
      epoch += 1;
      state.busy = false;
    },
  };
};
