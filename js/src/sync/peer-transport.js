// Transport failures must not escape a subscription into the storage write
// that emitted it, or stop fan-out to healthy peers. The write stays local;
// report failed delivery explicitly. Reconnection/catch-up is separate work.
export const isolatePeerTransport = (transport, onError) => {
  const report = (error) => {
    try {
      onError(error);
    } catch {
      // A failing diagnostic consumer cannot interrupt local persistence.
    }
  };
  return {
    send(event) {
      try {
        const result = transport.send(event);
        return result?.catch ? result.catch(report) : result;
      } catch (error) {
        report(error);
        return undefined;
      }
    },
    onMessage(handler) {
      return transport.onMessage((event) => {
        try {
          return Promise.resolve(handler(event)).catch(report);
        } catch (error) {
          report(error);
          return undefined;
        }
      });
    },
  };
};
