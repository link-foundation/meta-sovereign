/** Keep a small derived set current without rescanning the entire archive. */
export const createLiveSubset = (store, matches) => {
  if (typeof store.subscribe !== 'function') {
    return () => store.query(matches);
  }
  const records = new Map();
  let pending = null;
  let loaded = false;
  let during = [];
  const apply = (event) => {
    if (event.type === 'delete') {
      records.delete(event.id ?? event.link?.id);
    }
    if (event.type === 'put') {
      if (matches(event.link)) {
        records.set(event.link.id, event.link);
      } else {
        records.delete(event.link.id);
      }
    }
  };
  store.subscribe?.((event) => {
    if (loaded) {
      apply(event);
    } else {
      during.push(event);
    }
  });
  return async () => {
    if (!loaded) {
      pending ??= Promise.resolve()
        .then(() => store.query(matches))
        .then((links) => {
          links.forEach((link) => records.set(link.id, link));
          during.forEach(apply);
          during = [];
          loaded = true;
        })
        .finally(() => {
          pending = null;
        });
      await pending;
    }
    return [...records.values()];
  };
};
