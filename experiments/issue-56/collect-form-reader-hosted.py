"""Bind generic reader evidence to successful exact-source hosted execution."""
from pathlib import Path
import json
import re
import subprocess
import sys
import tarfile
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
source = source_reader(root, sha, entries)
registration = json.loads(source('js/scripts/browser-checks.json'))
shard = registration.index('forms-reader') % 4 + 1
selected = {'node': ('Checks and release', 'Test (node on ubuntu-26.04)')}
for engine in ['chromium', 'webkit']:
    selected[engine] = ('Checks and release',
                        f'Browser e2e ({engine}, shard {shard}/4)')
raw, jobs = read_jobs(root, runs, slug, selected, entries)
catalog_path = 'experiments/issue-56/form-reader-evidence.json'
catalog = json.loads((root / catalog_path).read_text())
audit = read_catalog_audit(root, sha, 'form-reader-criteria', catalog, source, entries)
tests = read_literal_tests(['forms-reader', 'forms-report'], source, raw['node'])
registration_name = 'inbox history and form inspection run in both mandatory browser lanes'
assert any(f'✔ {registration_name} (' in line for line in raw['node'])
source('js/tests/ci-contracts.test.js')

entry = source('js/tests/e2e-forms-reader-browser.mjs')
for call in ['verifyReport(report);', 'verifyReadOnly(report);',
             'await verifyLimits(page);']:
    assert entry.count(call) == 1, call
for text in ['referenced labels take precedence', 'fieldset fallback',
             'preceding heading', 'weaker label provenance',
             'native, ARIA and cross-origin fields share one report',
             'no input, click, change, submit or orphaned browser',
             'download contains the actual snapshot',
             'refusal preserves URL and last report',
             'form report fits phone viewport', 'finite field cap',
             'bounded values/options and custom coverage']:
    assert text in entry, text
runner = source('js/scripts/run-browser-checks.mjs')
assert 'timeout: 180_000' in runner
assert "FORMS_GROUP: [" in runner
assert 'FORMS_READER_ONLY' not in runner
for path in ['js/src/forms/read-document.js', 'js/src/forms/inspection.js',
             'js/src/forms/reader.js', 'js/src/cli/forms-commands.js',
             'js/src/server/routes-forms.js', 'js/src/web/forms-view.js',
             'experiments/issue-56/forms-reader-fixture.mjs']:
    source(path)

receipts = {}
for engine in ['chromium', 'webkit']:
    lines = raw[engine]
    endings = [(n, line) for n, line in enumerate(lines, 1)
               if re.search(r'Completed forms-reader in \d+ms; exit 0\s*$', line)]
    assert len(endings) == 1, (engine, endings)
    ending, _ = endings[0]
    starts = [n for n, line in enumerate(lines[:ending], 1)
              if 'Browser check: forms-reader' in line]
    assert starts, engine
    start = starts[-1]
    block = lines[start - 1:ending]
    assert any(f'[e2e-forms-reader] OK ({engine})' in line for line in block)
    assert not any('[forms-fixture-report]' in line or 'SKIP:' in line for line in block)
    receipts[engine] = dict(startLine=start, completedLine=ending,
                            semanticEnvelope=False, awaitedAssertions=True,
                            liveProvider=False)

archive = root / 'docs/case-studies/issue-56/data/forms-reader.tar.gz'
with tarfile.open(archive) as tar:
    metadata = json.load(tar.extractfile('metadata.json'))
    assert metadata['preceding_head'] == '4ed3f9c58c31e7f0495b3df8882ab6a01c7da610'
    before = tar.extractfile('ci-logs/forms-reader-browser-before.log').read().decode()
    assert 'assertion failed: shared Forms navigation exists' in before
    mcp = json.load(tar.extractfile('ci-logs/forms-reader-mcp-report.json'))
    assert mcp['fields'] == 15 and mcp['error'] is None
    fixture = json.loads(tar.extractfile('ci-logs/forms-reader-mcp-fixture.log')
                         .read().decode().splitlines()[-1])
    assert fixture['submissions'] == 0
    assert all(read['closed'] and not read['events'] for read in fixture['reads'])
assert audit['archives']['forms-reader']['sources']
references = read_reference_contracts(root,
    {None: ['ci-logs/qa19-reference-forms.json']}, entries,
    'fa0991b8c2d0896fb3b4be6c69947f0590094b15')
for name in [catalog_path, 'experiments/issue-56/collect-form-reader-hosted.py',
             'experiments/issue-56/audit-hosted-criteria.py',
             'experiments/issue-56/hosted_evidence.py',
             'experiments/issue-56/evidence_bundle.py',
             'docs/case-studies/issue-56/form-reader-criteria-audit.md']:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(sha=sha, criterion='QA21', jobs=jobs,
    workflows=5, namedTests=tests, registrationCheck=registration_name,
    browserReceipts=receipts, referenceContracts=references,
    acceptance=False, liveProvider=False), indent=2) + '\n').encode()
write_entries_archive(root / f'docs/case-studies/issue-56/data/form-reader-hosted-{slug}.tar.gz', entries)
