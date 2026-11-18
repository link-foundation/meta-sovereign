/** Finite controlled time for deadline semantics, independent of host scheduling. */
export const formDeadlineClock = () => {
  let time = 1000;
  const pending = new Map();
  const scheduled = [];
  const timers = {
    setTimeout(run, milliseconds) {
      const task = { run, at: time + milliseconds };
      scheduled.push(milliseconds);
      pending.set(task, task);
      return task;
    },
    clearTimeout: (task) => pending.delete(task),
  };
  return {
    now: () => time,
    timers,
    scheduled,
    pending: () => pending.size,
    advance(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new Error('Use a finite forward clock increment.');
      }
      time += milliseconds;
      for (let count = 0; count < 100; count++) {
        const due = [...pending.values()]
          .filter((task) => task.at <= time)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) {
          return;
        }
        pending.delete(due);
        due.run();
      }
      throw new Error(
        'The finite deadline clock exhausted its callback bound.'
      );
    },
  };
};
