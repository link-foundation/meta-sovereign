import { runnerApiFixture } from './runner-api-fixture.mjs';

const fixture = await runnerApiFixture();
console.log(JSON.stringify({ base: fixture.base, liveProvider: false }));
let timer;
try {
  await new Promise((resolve) => {
    process.once('SIGTERM', resolve);
    process.stdin.once('data', resolve);
    process.stdin.resume();
    timer = setTimeout(resolve, 180000);
  });
} finally {
  clearTimeout(timer);
  process.stdin.pause();
  await fixture.close();
  console.log(
    JSON.stringify({
      resourcesClosed: true,
      liveProvider: false,
      mutations: fixture.backend.calls.filter(
        ([, action]) => action !== 'probe'
      ),
    })
  );
}
