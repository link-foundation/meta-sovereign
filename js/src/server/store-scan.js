// Streaming read-only projections avoid materializing every raw provider payload.
export const scanLinks = async (
  store,
  filter,
  accept,
  project = (link) => link
) => {
  if (store.scan) {
    await store.scan(filter, 500, accept, project);
  } else {
    await accept((await store.query(filter)).map(project));
  }
};
export const lightLinks = async (store) => {
  const links = [];
  await scanLinks(
    store,
    undefined,
    (batch) => links.push(...batch),
    (link) =>
      Object.fromEntries(
        Object.keys(link)
          .filter((key) => key !== 'raw' && key !== 'snapshot')
          .map((key) => [key, link[key]])
      )
  );
  return links;
};
