"""Preserve actual cold-cache headed launch evidence without local downloads."""
import json
import subprocess
from evidence_bundle import evidence_context, write_entries_archive

root, logs, _ = evidence_context(__file__, 'browser-preparation')
run = json.loads((logs / 'browser-preparation-hosted-run.json').read_text())
parent = 'b98098b7d0b55d60557024eab21461068798641a'
assert run['id'] == 44308710016 and run['head_sha'] == parent
jobs = json.loads((logs / 'browser-preparation-current-jobs.json').read_text())['jobs']
job = next(item for item in jobs if item['id'] == 134820577461)
assert job['conclusion'] == 'success'
step = next(item for item in job['steps'] if item['name'] == 'Verify automatic first browser preparation')
assert step['conclusion'] == 'success'
artifact = logs / 'browser-preparation-hosted-artifact'
receipt = json.loads((artifact / 'browser-preparation.log').read_text().splitlines()[-1])
assert receipt == dict(initialExecutableAbsent=True, preparedBySharedLaunch=True,
                       headed=True, reused=True, resourcesClosed=True, liveProvider=False)
desktop = json.loads((logs / 'browser-preparation-hosted-desktop.json').read_text())
assert desktop['headSha'] == parent and desktop['conclusion'] == 'success'
builds = [item for item in desktop['jobs'] if item['name'].startswith('Build (')]
assert len(builds) == 5
assert all(item['conclusion'] == 'success' for item in builds)
paths = [
    'ci-logs/browser-preparation-hosted-run.json',
    'ci-logs/browser-preparation-current-jobs.json',
    'ci-logs/browser-preparation-current-artifacts.json',
    'ci-logs/browser-preparation-hosted-chromium-1.log',
    'ci-logs/browser-preparation-hosted-desktop.json',
    'ci-logs/browser-preparation-hosted-artifact/browser-preparation.log',
    'ci-logs/browser-preparation-hosted-artifact/summary.json',
    'docs/screenshots/issue-56-browser-preparation-hosted.png',
    'docs/case-studies/issue-56/browser-preparation.md',
    'experiments/issue-56/collect-browser-preparation-hosted.py',
    'experiments/issue-56/evidence_bundle.py',
]
entries = {name: (root / name).read_bytes() for name in paths}
for name in [
    'js/src/browser/preparation.js', 'js/src/cv/browser.js',
    'js/src/server/runner-transport.js', 'js/src/server/worker-client.js',
    'experiments/issue-56/browser-preparation-native.mjs',
    '.github/workflows/release.yml',
]:
    entries[f'published/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    publishedSource=parent, run=run, job=job['id'], receipt=receipt,
    acceptedInventoryRows=[], issueComplete=False,
    remainingVD01='remote tools and operating-system prerequisites',
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/browser-preparation-hosted.tar.gz', entries)
