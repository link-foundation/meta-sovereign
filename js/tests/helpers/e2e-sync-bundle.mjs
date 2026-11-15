// Read the real fixture server's bundle before navigation. An upstream failure
// in route.fetch() otherwise rejects a request callback outside awaited setup.
export const readSyncFixtureBundle = async (
  base,
  { request = globalThis.fetch, maxBytes = 16 * 1024 * 1024 } = {}
) => {
  const response = await request(`${base}/app.min.js`, {
    signal: globalThis.AbortSignal.timeout(10000),
  });
  if (
    !response.ok ||
    !/^(?:application|text)\/(?:java|ecma)script\b/iu.test(
      response.headers.get('content-type') ?? ''
    )
  ) {
    await response.body?.cancel();
    throw new Error(`sync fixture bundle unavailable: HTTP ${response.status}`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) {
      throw new Error('sync fixture bundle exceeds its finite byte budget');
    }
    chunks.push(chunk);
  }
  if (!size) {
    throw new Error('sync fixture bundle is empty');
  }
  return `globalThis.__syncFixtureMedia = await navigator.mediaDevices.getUserMedia({audio:true});\n${Buffer.concat(chunks, size).toString('utf8')}`;
};
