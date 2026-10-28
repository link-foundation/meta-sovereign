// Status follows the same recovery policy as other reads. Authentication and
// passcode changes keep their own confirmed, single-attempt semantics.
export const createPasscodeCaller =
  (ensure, announceLocked) => async (op, body) => {
    const { origin, requests } = await ensure();
    if (!origin) {
      return null;
    }
    const init =
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          };
    const response = await requests
      .request(new URL(`/api/passcode/${op}`, origin).toString(), init, {
        retry: body === undefined,
        json: true,
      })
      .then(announceLocked)
      .catch(() => null);
    const data = response ? await response.json().catch(() => null) : null;
    return data && { ...data, httpStatus: response.status };
  };
