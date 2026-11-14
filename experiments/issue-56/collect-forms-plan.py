"""Preserve bounded answer-plan regressions, browser results and source hashes."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'assertion failed: shared form answer planning exists' in (logs / 'forms-plan-browser-before.log').read_text()
assert 'fail 2' in (logs / 'forms-plan-labels-before.log').read_text()
assert 'pass 46' in (logs / 'forms-plan-node-final.log').read_text()
assert '17 passed | 0 failed' in (logs / 'forms-plan-deno.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (logs / 'forms-plan-browser-final.log').read_text()
assert not (logs / 'forms-plan-lint-final.log').read_text()
mcp = json.loads((logs / 'forms-plan-mcp-report.json').read_text())
assert mcp['width'] == mcp['scrollWidth'] == 1200 and not mcp['errors']
assert '9 proposals' in mcp['summary'] and 'Proposed: Ada Example' in mcp['first']
mobile = json.loads((logs / 'forms-plan-mcp-mobile.json').read_text())
assert mobile['width'] == mobile['scrollWidth'] == 390
fixture = json.loads((logs / 'forms-plan-mcp-fixture.log').read_text().splitlines()[-1])
assert fixture['submissions'] == 0
assert all(read['closed'] and not read['events'] for read in fixture['reads'])
changed = subprocess.check_output(
    ['git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
sources = sorted(set(name for name in changed if name and
                     not name.startswith('docs/case-studies/issue-56/data/')))
metadata = {
    'preceding_head': '946e4f87c8c3a8e525b1e90122624db9bfdc6c12',
    'checked': '2026-11-10',
    'checks': {'node': 46, 'deno': 17, 'strict_lint': 'pass',
               'chromium': 'production read/plan/provenance/export/refusal/retry/DOM states pass',
               'mcp': 'desktop/mobile current vs proposed values, no form interactions, owned close'},
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                for name in sources},
    'limits': 'Read-only synthetic current-page planning. Model proposals, reviewed prefilling, persistent sessions, multipage/submission/edit learning and wider issue criteria remain unfinished. New-head CI required.',
}
names = sorted(str(path.relative_to(root)) for path in logs.glob('forms-plan-*')
               if path.is_file() and path.suffix in ['.log', '.json'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['experiments/issue-56/collect-forms-plan.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/forms-answer-plan.tar.gz'
with archive.open('wb') as raw:
    with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as tar:
            for name, data in entries.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                tar.addfile(entry, io.BytesIO(data))
with tarfile.open(archive, 'r:gz') as tar:
    hashes = {entry.name: hashlib.sha256(tar.extractfile(entry).read()).hexdigest()
              for entry in tar.getmembers() if entry.isfile()}
assert hashes == {name: hashlib.sha256(data).hexdigest() for name, data in entries.items()}
archive.with_suffix('').with_suffix('.tar.sha256.json').write_text(
    json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
print(f'Verified {len(hashes)} archive entries and {len(sources)} source hashes')
