/** A successful current read can establish absence; a failed write cannot. */
export const completeReviewedWallDeletion = async (
  state,
  old,
  { guard, persist, issue }
) => {
  const observe = async () => {
    if ((await guard(state, old)) !== null) {
      return false;
    }
    if (!state.item.absent.includes(old.id)) {
      state.item.absent.push(old.id);
    }
    await persist(state, 'partial');
    return true;
  };
  if (await observe()) {
    return;
  }
  await state.context.sleep(5000, state.context.signal);
  try {
    await issue(state, old);
  } catch (error) {
    if (
      state.uncertain ||
      error.ambiguous ||
      (error.code !== 'wall-post-absent' && ![100, 104].includes(error.vkCode))
    ) {
      throw error;
    }
    state.issued = false;
    if (!(await observe())) {
      throw error;
    }
  }
};
