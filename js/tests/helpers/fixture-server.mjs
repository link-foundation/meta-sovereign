// Track before listen so fixture shutdown owns every accepted connection.
// This never discovers or closes any application server or foreign socket.
export const fixtureServerClose = (server, label = 'server') => {
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  let closing;
  return () => {
    closing ??= new Promise((resolve, reject) => {
      const debug = process.env.CI_FIXTURE_DEBUG === '1';
      const started = Date.now();
      if (debug) {
        console.error(
          `[fixture:${label}] closing ${sockets.size} owned connections`
        );
      }
      server.close((error) => {
        if (debug) {
          console.error(
            `[fixture:${label}] closed in ${Date.now() - started} ms`
          );
        }
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      for (const socket of sockets) {
        socket.destroy();
      }
    });
    return closing;
  };
};
