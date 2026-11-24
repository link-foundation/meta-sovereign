/** Opt-in fixture boundaries; never include commands, paths, data or errors. */
let sequence = 0;
export const traceCvPublicationFixture = async (phase, work) => {
  if (process.env.CI_CV_PUBLICATION_DEBUG !== '1') {
    return work();
  }
  const id = ++sequence;
  const started = globalThis.performance.now();
  const trace = (state) =>
    console.error(
      '[cv-publication-fixture]',
      JSON.stringify({
        id,
        phase,
        state,
        elapsedMs: Math.round(globalThis.performance.now() - started),
      })
    );
  trace('started');
  try {
    const answer = await work();
    trace('completed');
    return answer;
  } catch (error) {
    trace('failed');
    throw error;
  }
};
