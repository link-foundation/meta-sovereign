"""Preserve finite reviewed-prefill regressions and independent browser evidence."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'live reviewed prefilling exists' in (logs / 'forms-prefill-browser-before.log').read_text()
assert 'pass 51' in (logs / 'forms-prefill-node-final.log').read_text()
assert '15 passed | 0 failed' in (logs / 'forms-prefill-deno.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (logs / 'forms-prefill-browser-final.log').read_text()
assert '[e2e-forms-reader] OK (webkit)' in (logs / 'forms-prefill-webkit-focused-before.log').read_text()
assert not (logs / 'forms-prefill-lint-final.log').read_text()
plan = json.loads((logs / 'forms-prefill-mcp-plan.json').read_text())
assert (plan['fields'], plan['supported'], plan['selected'], plan['applyDisabled']) == (9, 7, 0, True)
for size, name in [(1200, 'desktop'), (390, 'mobile')]:
    value = json.loads((logs / f'forms-prefill-mcp-{name}.json').read_text())
    assert value['width'] == value['scrollWidth'] == size
    assert value['state'] == 'applied' and not value['errors']
    assert len(value['receipts']) == 4
    assert all(receipt['status'] == 'applied' for receipt in value['receipts'])
closed = json.loads((logs / 'forms-prefill-mcp-closed.json').read_text())
assert closed == {'cards': 0, 'receipts': 4, 'state': 'applied', 'error': None}
fixture = json.loads((logs / 'forms-prefill-mcp-fixture.log').read_text().splitlines()[-1])
assert fixture['submissions'] == 0 and len(fixture['reads']) == 1
assert fixture['reads'][0]['closed']
assert fixture['reads'][0]['values'] == {
    'fullName': 'Ada Example', 'email': '', 'location': 'vn',
    'newsletter': True, 'start': '', 'language': ''}
assert all(request['method'] == 'GET' for request in fixture['requests'])
changed = subprocess.check_output(
    ['git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
sources = sorted(set(name for name in changed if name and
                     not name.startswith('docs/case-studies/issue-56/data/')))
metadata = {
    'preceding_head': '2bbf8998bda14c71586097728b398508c97df2ac',
    'checked': '2026-11-10',
    'checks': {'node': 51, 'deno': 15, 'strict_lint': 'pass',
               'chromium': 'six selected changes, lost-response recovery without replay, stale-page refusal, desktop/mobile, acknowledged close',
               'webkit_linux': 'single focused production Forms flow passed; earlier macOS CI refusal remains unreproduced',
               'mcp': 'four selected changes; unchanged unselected fields, desktop/mobile, zero submissions, acknowledged close'},
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                for name in sources},
    'limits': 'Native text/single select/checkbox foundation. Native radio/custom controls, models, authenticated external forms, accumulated pages, edit/submission learning, assignments and wider issue criteria remain unfinished. New-head hosted CI is required.',
}
names = sorted(str(path.relative_to(root)) for path in logs.glob('forms-prefill-*')
               if path.is_file() and path.suffix in ['.log', '.json', '.diff'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['experiments/issue-56/collect-forms-prefill.py',
          'ci-logs/checks-and-release-42839137051.log',
          'ci-logs/forms-prefill-ci-browser-webkit/summary.json',
          'ci-logs/forms-prefill-ci-browser-webkit/ms-e2e-forms-reader-webkit.png']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/forms-reviewed-prefill.tar.gz'
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
