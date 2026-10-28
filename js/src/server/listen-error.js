// Keep busy-port diagnostics consistent across Node, Bun and Deno launchers.
export const listenFailure = (error, port) =>
  error?.code === 'EADDRINUSE'
    ? Object.assign(
        new Error(
          `port ${port} is already in use (another meta-sovereign running? try --port=<n>)`
        ),
        { code: 'EADDRINUSE', cause: error }
      )
    : error;
