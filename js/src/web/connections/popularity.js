// How many people use each service: Connections lists the biggest first,
// because that is the one a newcomer most likely has.
//
// Rough public figures (monthly active users where published, otherwise
// registered accounts), rounded; they only order the list and label the
// cards with an approximate size:
//   email          ~4.6 B  email users worldwide (Radicati, 2025)
//   whatsapp       ~3 B    monthly users (Meta, 2025)
//   facebook       ~3 B    monthly users (Meta, 2025)
//   linkedin       ~1.2 B  members (LinkedIn, 2025)
//   telegram       ~1 B    monthly users (Telegram, 2025)
//   x              ~600 M  monthly users (X, 2024)
//   github         ~150 M  developers (GitHub, 2025)
//   vk             ~100 M  monthly users (VK, 2025)
//   naukri         ~100 M  registered job seekers (Info Edge)
//   hh             ~60 M   resumes (HeadHunter)
//   superjob       ~30 M   registered users
//   upwork         ~18 M   registered freelancers
//   topcv          ~10 M   candidates
//   vietnamworks   ~6 M    job seekers
//   peopleperhour  ~3 M    freelancers
//   habr-career    ~1 M    specialists

export const serviceUsers = {
  email: 4.6e9,
  whatsapp: 3.0e9,
  facebook: 3.0e9,
  linkedin: 1.2e9,
  telegram: 1.0e9,
  x: 6.0e8,
  github: 1.5e8,
  vk: 1.0e8,
  naukri: 1.0e8,
  hh: 6.0e7,
  superjob: 3.0e7,
  upwork: 1.8e7,
  topcv: 1.0e7,
  vietnamworks: 6.0e6,
  peopleperhour: 3.0e6,
  'habr-career': 1.0e6,
};

/** Biggest first; unknown services last, in their original order. */
export const byPopularity = (ids) =>
  ids
    .map((id, index) => ({ id, index, users: serviceUsers[id] ?? 0 }))
    .sort((a, b) => b.users - a.users || a.index - b.index)
    .map(({ id }) => id);

/** "4.6B", "600M", "1 млн" … in the reader's language. */
export const formatUsers = (count, locale) =>
  new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count);
