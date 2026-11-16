// Load provider route graphs only after the shared request guards and a matching
// path. ESM owns concurrent import caching; the existing handlers retain all
// method, account, mutation admission and service lifecycle decisions.
export const handleCvRoutes = async (store, req, res, path, url, ctx) => {
  if (!path.startsWith('/api/cv/')) {
    return false;
  }
  const { handleCvRoutes: handle } = await import('./routes-cv.js');
  return handle(store, req, res, path, url, ctx);
};

export const handleVacancyRoutes = async (store, req, res, path, ctx) => {
  if (!path.startsWith('/api/vacancies/')) {
    return false;
  }
  const { handleVacancyRoutes: handle } = await import('./routes-vacancies.js');
  return handle(store, req, res, path, ctx);
};

export const handleTelegramRoutes = async (req, res, path, ctx) => {
  if (!path.startsWith('/api/telegram/')) {
    return false;
  }
  const { handleTelegramRoutes: handle } = await import('./routes-telegram.js');
  return handle(req, res, path, ctx);
};
