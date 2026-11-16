export const openBrowserMergeTab = (page, options) =>
  page.evaluate(async ({ name, kind, side, trace }) => {
    const m = await import(`/${side}.js`);
    const driver =
      kind === 'indexedDB'
        ? m.createIndexedDbDriver({ dbName: name })
        : m.createLocalStorageDriver(globalThis.localStorage, name);
    await globalThis.snapshotStore?.close?.();
    globalThis.snapshotErrors = [];
    globalThis.snapshotStore = await m.openCausalBrowserStore({
      driver: {
        ...driver,
        async load() {
          const result = await driver.load();
          if (trace) {
            console.log(
              JSON.stringify({
                kind,
                loadedRecords: result?.links?.length ?? 0,
              })
            );
          }
          return result;
        },
        async save(...args) {
          const held = globalThis.snapshotWriteHold;
          if (held) {
            globalThis.snapshotWriteAdmitted = true;
            await held;
          }
          try {
            const result = await driver.save(...args);
            if (trace) {
              console.log(
                JSON.stringify({
                  kind,
                  savedRecords: args[0]?.links?.length ?? 0,
                })
              );
            }
            return result;
          } catch (error) {
            if (trace) {
              // Fixture diagnostics omit all snapshot payloads and revisions.
              console.log(JSON.stringify({ kind, saveError: error.code }));
            }
            throw error;
          }
        },
      },
      onEvent: trace
        ? (event) => console.log(JSON.stringify({ kind, ...event }))
        : undefined,
      onError: (error) => globalThis.snapshotErrors.push(error.code),
    });
  }, options);
