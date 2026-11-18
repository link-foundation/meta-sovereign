import { setTimeout as sleep } from 'node:timers/promises';

export async function waitForServer(
  url,
  child,
  {
    deadlineMs = 30_000,
    intervalMs = 250,
    request = fetch,
    headers,
    ready = () => true,
  } = {}
) {
  const end = Date.now() + deadlineMs;
  let answered = false;
  while (Date.now() < end) {
    if (child.exitCode !== null) {
      throw new Error(`the server exited with ${child.exitCode}`);
    }
    const controller = new AbortController();
    const timer = globalThis.setTimeout(
      () => controller.abort(),
      Math.min(2000, end - Date.now())
    );
    try {
      const answer = await request(url, { signal: controller.signal, headers });
      if (answer.ok) {
        answered = true;
        if (ready()) {
          return;
        }
      }
    } catch {
      // Retry connection refusal while the server starts, within the same deadline.
    } finally {
      globalThis.clearTimeout(timer);
    }
    await sleep(intervalMs);
  }
  if (answered) {
    throw new Error(
      `the server answered but CLI startup was not complete after ${deadlineMs}ms`
    );
  }
  throw new Error(
    `no answer from ${url} after ${deadlineMs}ms of server startup`
  );
}
