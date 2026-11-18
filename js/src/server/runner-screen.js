/** Bind Screen controls to a fresh native identity, independent of start history. */
export const screenRunnerObservation = (target, result) => {
  const unknown = { state: 'unknown', id: null };
  if (result.aborted || ![0, 1].includes(result.code)) {
    return unknown;
  }
  const output =
    `${String(result.stdout ?? '').trim()}\n${result.stderr ?? ''}`.trim();
  if (result.code === 1 && /^No Sockets found in [^\r\n]+\.$/.test(output)) {
    return { state: 'stopped', id: null };
  }
  if (
    result.code !== 0 ||
    !/^There (?:is a screen|are screens) on:\r?\n/.test(output)
  ) {
    return unknown;
  }
  const lines = output.split(/\r?\n/);
  const count = lines
    .at(-1)
    .trim()
    .match(/^(\d+) Sockets? in [^\r\n]+\.$/);
  if (!count) {
    return unknown;
  }
  const sessions = lines.slice(1, -1).filter((line) => line.trim());
  const parsed = sessions.map((line) =>
    line.trim().match(/^(\d+)\.([^\s]+)\s+.+\((?:Attached|Detached)\)$/)
  );
  if (Number(count[1]) !== parsed.length || parsed.some((line) => !line)) {
    return unknown;
  }
  const matching = parsed.filter((line) => line[2] === target.session);
  if (matching.length > 1) {
    return unknown;
  }
  return matching.length === 1
    ? { state: 'running', id: `${matching[0][1]}.${matching[0][2]}` }
    : { state: 'stopped', id: null };
};

export const stopScreenRunner = async (target, run, options) => {
  const observed = screenRunnerObservation(
    target,
    await run(target, ['screen', '-ls'], options)
  );
  if (observed.state !== 'running' || options.signal?.aborted) {
    return false;
  }
  const reply = await run(
    target,
    ['screen', '-S', observed.id, '-X', 'stuff', '\u0003'],
    options
  );
  return reply.code === 0 && !reply.aborted;
};
