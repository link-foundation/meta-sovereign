/** File defaults belong to one runtime, never to durable owner settings. */
const defaults = new WeakMap();

export const configureAutomationSettings = (store, configuration = {}) => {
  defaults.set(
    store,
    new Map(
      Object.entries(configuration.vk ?? {}).map(([name, settings]) => [
        `provider-job:vk:${name}`,
        globalThis.structuredClone(settings),
      ])
    )
  );
  return store;
};

export const readAutomationSettings = async (store, id) => {
  const base = defaults.get(store)?.get(id);
  const saved = await store.get(id);
  return base ? { ...globalThis.structuredClone(base), ...saved } : saved;
};
