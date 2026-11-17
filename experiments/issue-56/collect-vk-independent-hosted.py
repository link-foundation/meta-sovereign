"""Bind independent VK switches to published source and both native engines."""
import json
from pathlib import Path
import subprocess
import sys
from evidence_bundle import write_entries_archive
from hosted_evidence import (
    read_workflows, read_jobs, source_reader, read_catalog_audit,
    read_literal_tests, read_reference_contracts,
)

root = Path(__file__).resolve().parents[2]
revision, slug = sys.argv[1:]
sha = subprocess.check_output(['git', 'rev-parse', revision], cwd=root).decode().strip()
entries = {}
runs = read_workflows(root, sha, slug, entries)
registration = json.loads(subprocess.check_output(
    ['git', 'show', f'{sha}:js/scripts/browser-checks.json'], cwd=root))
shard = registration.index('vk-independent') % 4 + 1
selection = {'node': ('Checks and release', 'Test (node on ubuntu-26.04)')}
selection.update({f'{engine}-{shard}': (
    'Checks and release', f'Browser e2e ({engine}, shard {shard}/4)')
    for engine in ['chromium', 'webkit']})
raw, jobs = read_jobs(root, runs, slug, selection, entries)
source = source_reader(root, sha, entries)
catalog_path = 'experiments/issue-56/vk-independent-evidence.json'
catalog = json.loads((root / catalog_path).read_text())
audit = read_catalog_audit(root, sha, 'vk-independent-criteria', catalog, source, entries)
tests = read_literal_tests([
    'vk-friends', 'vk-maintenance', 'vk-wall', 'vk-wall-parity',
    'vk-wall-guards', 'vk-wall-interfaces', 'vk-wall-media', 'vk-wall-capability',
    'vk-birthday', 'vk-birthday-guards', 'vk-birthday-interfaces',
    'vk-birthday-capability', 'vk-desktop-policy', 'vk-desktop-policy-settings',
], source, raw['node'])
assert sum(map(len, tests.values())) == 92
independence = source('js/tests/vk-independent-jobs.test.js')
assert '`VK ${selected} runs independently and its disable survives Lino reopen`' in independence
dynamic = {}
for kind in ['online', 'friends', 'cleanup', 'outgoing', 'wall', 'birthday']:
    name = f'VK {kind} runs independently and its disable survives Lino reopen'
    found = [i for i, line in enumerate(raw['node'], 1) if f'✔ {name} (' in line]
    assert len(found) == 1, (name, found)
    dynamic[name] = found[0]
source('experiments/issue-56/vk-independent-fixture.mjs')
source('js/tests/helpers/e2e-vk-independent.mjs')
assert 'verifyVkIndependent' in source('js/tests/e2e-vk-independent-browser.mjs')
receipts = {}
for engine in ['chromium', 'webkit']:
    lines = raw[f'{engine}-{shard}']
    assert any(f'[e2e-vk-independent] OK ({engine})' in line for line in lines)
    found = [(i, json.loads(line.split('[vk-independent] ', 1)[1]))
             for i, line in enumerate(lines, 1) if '[vk-independent] ' in line]
    assert len(found) == 1, (engine, found)
    line, result = found[0]
    assert result == dict(independentPolicies=6, acknowledgedToggles=12,
        reloads=6, retainedFields=True, schedulerRunning=False, providerEffects=0,
        pageErrors=0, liveProvider=False)
    receipts[engine] = dict(line=line, result=result)
references = read_reference_contracts(root, {None: [
    'ci-logs/vk-independent-reference-config.json',
    'ci-logs/vk-desktop-reference-requirements.json',
]}, entries, '8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1')
for name in [catalog_path, 'experiments/issue-56/collect-vk-independent-hosted.py',
             'experiments/issue-56/hosted_evidence.py',
             'experiments/issue-56/evidence_bundle.py',
             'docs/case-studies/issue-56/vk-independent-jobs.md']:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(
    sha=sha, criterion='VD03', workflows=5, jobs=jobs, namedTests=tests,
    independentTests=dynamic, nativeReceipts=receipts, referenceContracts=references,
    archivedUnits=len(catalog), archivedEntries=sum(row['entries'] for row in audit['archives'].values()),
    acceptance=False, liveProvider=False), indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/vk-independent-hosted-{slug}.tar.gz', entries)
