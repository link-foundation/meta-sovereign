// Bounded, provider-free probe of synthetic Node signal event compatibility.
// Run with Node and Deno on the target platform; it emits no OS signal.
for (const signal of ['SIGINT', 'SIGTERM']) {
  let calls = 0;
  const listener = () => {
    calls += 1;
  };
  process.once(signal, listener);
  const registered = process.listeners(signal).includes(listener);
  const emitted = process.emit(signal);
  process.removeListener(signal, listener);
  console.log(
    JSON.stringify({
      platform: process.platform,
      runtime: process.version,
      deno: globalThis.Deno?.version.deno ?? null,
      signal,
      registered,
      emitted,
      calls,
    })
  );
}
