export const enDiscovery = {
  'discovery.title': 'Discover vacancies',
  'discovery.hint':
    'Read a finite search and collect full descriptions for eligible cards. Search settings stay fixed for this run. Review the saved results before using them in an application batch.',
  'discovery.bounds': 'Discovery limits',
  'discovery.collectionHint':
    'When off, full descriptions are read for filtering and stay in memory while this worker runs. Discovery history keeps decisions, not descriptions. Existing saved descriptions are kept. A batch started from discovery inherits this setting.',
  'discovery.collectionMemory':
    'Description storage: off for this discovery. Restart cannot restore its temporary descriptions; saved decisions remain available.',
  'discovery.readAt': 'Description read: {date}',
  'discovery.maxPages': 'Maximum pages',
  'discovery.maxVacancies': 'Maximum distinct vacancies',
  'discovery.durationMs': 'Maximum duration (seconds)',
  'discovery.refresh': 'Refresh previously saved descriptions',
  'discovery.start': 'Start discovery',
  'discovery.status': 'Refresh discovery status',
  'discovery.stop': 'Stop discovery',
  'discovery.progress':
    'Pages visited: {pages} · Distinct vacancies: {count} · Duplicates: {duplicates}',
  'discovery.source':
    'Saved search: {query} · Resume: {resume} · Up to {pages} pages / {maximum} vacancies',
  'discovery.useBatch': 'Use completed discovery in batch',
  'discovery.batchSource': 'Discovery source {requestId}',
  'discovery.phase.running': 'Discovery is running',
  'discovery.phase.completed': 'Discovery finished within its limits',
  'discovery.phase.stopped': 'Discovery stopped; acknowledged results retained',
  'discovery.phase.expired':
    'Discovery duration expired; acknowledged results retained',
  'discovery.phase.failed': 'Discovery failed; acknowledged results retained',
  'discovery.phase.interrupted':
    'Discovery was interrupted; reading status does not restart it',
  'discovery.reason.exhausted': 'The native search has no further page',
  'discovery.reason.page-limit':
    'The page limit was reached; more results may exist',
  'discovery.reason.vacancy-limit':
    'The vacancy limit was reached; the current page may be partial',
  'discovery.salaryLadder': 'Descend matching-search salary tiers',
  'discovery.salaryHint':
    'Use the shared salary targets below. Resume searches start at the RUB net target when no minimum is set, then drop by 50,000 RUB only after every page is exhausted. Unknown pay stays eligible. No applications are sent.',
  'discovery.salaryTier': 'Salary tier {tier} · Minimum {floor} RUB equivalent',
  'discovery.pay.apply': 'Pay eligible',
  'discovery.pay.defer': 'Pay deferred to a lower tier',
  'discovery.pay.exclude':
    'Pay excluded: advertised maximum below half the target',
};
