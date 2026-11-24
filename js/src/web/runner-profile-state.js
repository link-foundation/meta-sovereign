export const canSaveRunnerProfile = (state) =>
  Boolean(
    state.saved &&
    !state.busy &&
    !state.error &&
    state.saved.document !== state.draft
  );

/** Own one request; keep newer owner edits and never replay an uncertain save. */
export const editRunnerProfile = ({ request, update }) => {
  const owner = new AbortController();
  let state = {
    saved: null,
    draft: '',
    busy: false,
    error: false,
    acknowledged: false,
  };
  let active = false;
  const publish = (patch) => {
    if (!owner.signal.aborted) {
      state = { ...state, ...patch };
      update(state);
    }
  };
  const perform = async (action) => {
    if (active || owner.signal.aborted) {
      return;
    }
    const input = { document: state.draft, revision: state.saved?.revision };
    active = true;
    publish({ busy: true, pending: action, acknowledged: false });
    try {
      const saved = await request(
        action,
        action === 'configure' ? input : undefined,
        owner.signal
      );
      publish({
        saved,
        draft:
          action === 'profile' || state.draft === input.document
            ? saved.document
            : state.draft,
        error: false,
        acknowledged: action === 'configure' && state.draft === input.document,
      });
    } catch {
      publish({ error: true });
    } finally {
      active = false;
      publish({ busy: false, pending: null });
    }
  };
  void perform('profile');
  return {
    edit: (draft) => {
      if (state.pending !== 'profile') {
        publish({ draft, acknowledged: false });
      }
    },
    reload: () => perform('profile'),
    save: () =>
      canSaveRunnerProfile(state) ? perform('configure') : Promise.resolve(),
    close: () => owner.abort(),
  };
};
