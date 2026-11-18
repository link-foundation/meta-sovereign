"""Preserve bounded native hydration, published refusals and drained UI evidence."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive, verify_evidence
from hosted_evidence import read_reference_contracts

root = Path(__file__).resolve().parents[2]
parent = 'cd4cd0b5c0c894a3a7501371a2ce95f6d3ad22e0'
prefix = 'vacancy-loading'
read = lambda name: (root / f'ci-logs/{prefix}-{name}.log').read_text()
verify_evidence(read, {
    'parent': ['tests 5', 'pass 2', 'fail 3', 'assignment-vacancy-unavailable',
               'jobs-application-vacancy'],
    'final-focused': ['tests 12', 'pass 12', 'fail 0'],
    'focused': ['tests 40', 'pass 40', 'fail 0'],
    'before-native': ['TimeoutError', 'data-vacancy-snapshot'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
})
receipt = json.loads(read('browser'))
assert receipt == dict(delayedDescription=True, nativeReads=3,
    exactDescriptionHtml=True, browserOpens=2, providerClicks=0,
    pageErrors=0, liveProvider=False)
response = json.loads((root / 'ci-logs/vacancy-loading-mcp.json').read_text())
mcp = json.loads(response['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert mcp == dict(modernMetadata=True, cacheRecovered=True,
                   widths=[1180, 390], pageErrors=[], liveProvider=False)
closed = json.loads(read('mcp-server').splitlines()[-1])
assert closed['opens'] == 2 and closed['closed'] and closed['resourcesClosed']
assert closed['providerClicks'] == 0 and not closed['pageErrors']
assert closed['liveProvider'] is False
assert closed['delayedReads'][0]['description'] == ''
assert closed['delayedReads'][-1]['description'] == (
    'Build Python services.\nFinal employer paragraph.')
paths = [
    'js/src/assignments/vacancy-loading.js',
    'js/src/assignments/vacancy-reader.js', 'js/src/assignments/read-page.js',
    'js/src/assignments/vacancy-content.js', 'js/src/assignments/validation.js',
    'js/src/jobs/application-review.js',
    'js/tests/vacancy-loading.test.js', 'js/tests/vacancy-loading-bounds.test.js',
    'js/tests/helpers/e2e-vacancy-loading.mjs', 'js/tests/e2e-vacancies-browser.mjs',
    'js/scripts/browser-checks.json',
    'experiments/issue-56/vacancy-metadata-fixture.mjs',
    'experiments/issue-56/vacancy-metadata-mcp-server.mjs',
    'experiments/issue-56/vacancy-loading-before.py',
    'experiments/issue-56/vacancy-loading-browser.mjs',
    'experiments/issue-56/vacancy-loading-mcp.py',
    'experiments/issue-56/vacancy-metadata-mcp.mjs',
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/question-browser-probe.mjs',
    'experiments/issue-56/collect-vacancy-loading.py',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/hosted_evidence.py',
    'docs/case-studies/issue-56/vacancy-loading.md',
    '.changeset/delayed-vacancy-description.md',
]
paths += [str(path.relative_to(root)) for path in sorted(
    (root / 'docs/screenshots/issue-56-vacancy-loading').glob('*.png'))]
paths += [str(path.relative_to(root)) for path in sorted(
    (root / 'ci-logs').glob('vacancy-loading-*')) if path.is_file()
    and path.suffix in ['.log', '.json', '.png', '.mjs']
    and not path.name.endswith(('-archive.log', '-commit.log', '-push.log'))]
entries = {name: (root / name).read_bytes() for name in paths}
for name in ['js/src/assignments/vacancy-reader.js', 'js/src/jobs/application-review.js']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
references = read_reference_contracts(root,
    {None: ['ci-logs/vacancy-html-reference.json']}, entries,
    'fa0991b8c2d0896fb3b4be6c69947f0590094b15')
entries['metadata.json'] = (json.dumps(dict(parent=parent, parentFailures=3,
    compatibleControls=2, focusedChecks=40, finalLoadingChecks=12,
    nativeReceipt=receipt, mcpReceipt=mcp, referenceContracts=references,
    fullLocalSuite=False, exactSourceHostedVerificationRequired=True,
    acceptedInventoryRows=[], issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-loading.tar.gz', entries)
