// Open the hosted face of the app, including when the local UI is enabled.
import { spawn } from 'node:child_process';

export const maybeOpenHostedApp = (args, handle, log) => {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const enabled =
    args.open === undefined ? interactive : String(args.open) !== 'false';
  if (args.foreground === false || !enabled) {
    return;
  }
  const [program, ...prefix] =
    process.platform === 'darwin'
      ? ['open']
      : process.platform === 'win32'
        ? ['rundll32.exe', 'url.dll,FileProtocolHandler']
        : ['xdg-open'];
  const browser = spawn(program, [...prefix, handle.uiUrl], {
    detached: true,
    stdio: 'ignore',
  });
  browser.on('error', () =>
    log(`open the app in your browser → ${handle.uiUrl}`)
  );
  browser.unref();
};
