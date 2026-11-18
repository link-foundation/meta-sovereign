"""Verify bounded native progress evidence and preserve the published failure."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs, bundle,
)

root, logs, read = evidence_context(__file__, 'vacancy-discovery-progress')
verify_evidence(read, {
    'before': ['Timeout 30000ms exceeded', 'data-discovery-phase="completed"'],
    'parent-probe': ['Published test fails awaiting aggregate completion'],
    'after': ['[e2e-vacancy-discovery] OK (webkit)', '"phase":"passed"'],
    'format-final': ['All matched files use Prettier code style!'],
})
result = next(json.loads(line) for line in read('after').splitlines()
              if line.startswith('{"pages":'))
assert {key: result[key] for key in [
    'pages', 'vacancies', 'descriptions', 'providerClicks', 'recoveryReplayed',
    'batchStarted', 'locales', 'resourcesClosed',
]} == dict(pages=2, vacancies=3, descriptions=2, providerClicks=0,
          recoveryReplayed=False, batchStarted=False, locales=4, resourcesClosed=True)
assert len(result['navigationMs']) == 4
assert all(3000 <= elapsed < 30000 for elapsed in result['navigationMs'])
runs = [json.loads(path.read_text()) for path in
        logs.glob('vacancy-discovery-progress-hosted-*.json')]
assert len(runs) == 5
assert all(run['headSha'] == 'aae37f2ddd2ad17e9baaa7a0e315db9722ccdd7e'
           and run['status'] == 'completed' for run in runs)
failed = [job['name'] for run in runs for job in run['jobs']
          if job['conclusion'] == 'failure']
assert failed == ['Browser e2e (webkit, shard 2/4)', 'Pipeline status'], failed
sources = changed_sources(root)
receipts = evidence_logs(root, 'vacancy-discovery-progress') + [
    'ci-logs/checks-43716827172-webkit-shard2.log',
    'ci-logs/checks-43716827172-pipeline.log',
    'ci-logs/vacancy-discovery-ci-webkit-probe.log',
]
bundle(root, sources + receipts,
       'docs/case-studies/issue-56/data/ci-vacancy-discovery-progress.tar.gz', {
           'published_failure': runs[0]['headSha'],
           'parent_probe': 'b0d1b6a3f0902d4cc72773ea54e99ffd2a137aec',
           'native_reads': 4, 'fixture_delay_per_read_ms': 3000,
           'default_locator_deadline_ms': 30000,
           'parent_failed': True, 'revised_passed': True,
           'production_changes': False, 'issue_complete': False,
           'hosted_verification_pending': True,
       }, 'issue-56-vacancy-discovery-progress/*.png', before={
           'js/tests/helpers/e2e-vacancy-discovery.mjs': 'b0d1b6a3',
           'experiments/issue-56/vacancy-browser-fixture.mjs': 'b0d1b6a3',
       })
