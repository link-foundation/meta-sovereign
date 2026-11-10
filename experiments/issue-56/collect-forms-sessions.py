"""Preserve finite review-session regressions, browser results and source hashes."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'persistent form review controls exist' in (logs / 'forms-session-browser-before.log').read_text()
assert 'persistent review controls exist' in (logs / 'forms-session-before.log').read_text()
assert 'pass 39' in (logs / 'forms-session-node-final.log').read_text()
assert '12 passed | 0 failed' in (logs / 'forms-session-deno.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (logs / 'forms-session-browser-final.log').read_text()
assert not (logs / 'forms-session-lint-final.log').read_text()
for size, name in [(1200, 'desktop'), (390, 'mobile')]:
    value = json.loads((logs / f'forms-session-mcp-{name}.json').read_text())
    assert value['width'] == value['scrollWidth'] == size
    assert value['cards'] == 1 and value['fields'] == 15
    assert value['headlessFocusDisabled'] and not value['errors']
closed = json.loads((logs / 'forms-session-mcp-closed.json').read_text())
assert closed == {'cards': 0, 'fields': 15, 'error': None}
fixture = json.loads((logs / 'forms-session-mcp-fixture.log').read_text().splitlines()[-1])
assert fixture['submissions'] == 0
assert all(item['closed'] and not item['events'] for item in fixture['reads'])
assert all(request['method'] == 'GET' for request in fixture['requests'])
changed = subprocess.check_output(
    ['git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
sources = sorted(set(name for name in changed if name and
                     not name.startswith('docs/case-studies/issue-56/data/')))
metadata = {
    'preceding_head': '0176fe7d9bc8227602b913302d4ff03e9d923be9',
    'checked': '2026-11-10',
    'checks': {'node': 39, 'deno': 12, 'strict_lint': 'pass',
               'chromium': 'production owned review slots, edits, current-page reread, failed-close recovery, desktop/mobile, acknowledged cleanup',
               'mcp': '15 fields; desktop/mobile, actual visibility, zero form events/submissions, owned close'},
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                for name in sources},
    'limits': 'Synthetic read-only review browsers. Authenticated Google/Yandex/CAPTCHA, reviewed prefilling, models, accumulated pages/submission/edit learning and broader issue criteria remain unfinished. New-head hosted CI remains required.',
}
names = sorted(str(path.relative_to(root)) for path in logs.glob('forms-session-*')
               if path.is_file() and path.suffix in ['.log', '.json', '.diff'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['experiments/issue-56/collect-forms-sessions.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/forms-review-sessions.tar.gz'
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
