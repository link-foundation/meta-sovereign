import { desktopLandingFixture } from './desktop-landing-browser-fixture.mjs';

const fixture = await desktopLandingFixture();
console.log(JSON.stringify({ pid: process.pid, base: fixture.base }));
let closing;
const close = () =>
  (closing ??= fixture.close().then(() => {
    console.log(JSON.stringify({ resourcesClosed: true }));
  }));
process.once('SIGTERM', close);
process.once('SIGINT', close);
