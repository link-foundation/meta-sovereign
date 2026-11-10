"""Verify and retain bounded native-radio regression and browser evidence."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'native radio option can be reviewed' in (logs / 'forms-radio-browser-before.log').read_text()
assert 'pass 55' in (logs / 'forms-radio-node-final.log').read_text()
assert '19 passed | 0 failed' in (logs / 'forms-radio-deno-final.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (logs / 'forms-radio-browser.log').read_text()
assert not (logs / 'forms-radio-lint-final.log').read_text()
plan = json.loads((logs / 'forms-radio-mcp-plan.json').read_text())
assert plan['fields'] == 10 and len(plan['selectable']) == 5 and len(plan['effects']) == 3
assert all(not field['checked'] for field in plan['selectable']) and plan['applyDisabled']
for width, name in [(1200, 'desktop'), (390, 'mobile')]:
    value = json.loads((logs / f'forms-radio-mcp-{name}.json').read_text())
    assert value['state'] == 'applied' and not value['errors']
    assert value['width'] == value['scrollWidth'] == width
    if name == 'desktop':
        assert len(value['receipts']) == len(value['effects']) == 2
        assert all(item['status'] == 'applied' for item in value['receipts'] + value['effects'])
    else:
        assert value['receipts'] == value['effects'] == 2
closed = json.loads((logs / 'forms-radio-mcp-closed.json').read_text())
assert closed == {'cards': 0, 'state': 'applied', 'receipts': 2, 'effects': 2, 'errors': []}
fixture = json.loads((logs / 'forms-radio-mcp-fixture.log').read_text().splitlines()[-1])
assert fixture['submissions'] == 0 and len(fixture['reads']) == 1
read = fixture['reads'][0]
assert read['closed'] and len(read['events']) == 6 and 'submit' not in read['events']
main, child = [{field['id']: field['checked'] for field in frame} for frame in read['radioFrames']]
assert main == {'main-remote': True, 'main-office': False, 'main-hybrid': False,
                'other-remote': False, 'other-office': True, 'hidden-peer-remote': False,
                '': True, 'unnamed-one': False, 'unnamed-two': False}
assert child == {'child-remote': True, 'child-office': False}
assert all(request['method'] == 'GET' for request in fixture['requests'])
changed = subprocess.check_output(['git', 'diff', '--name-only', '-z', 'afaf8bed'], cwd=root)
changed += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=root)
sources = sorted(set(name for name in changed.decode().split('\0') if name and
                     not name.startswith('docs/case-studies/issue-56/data/')))
metadata = {
    'preceding_head': 'afaf8bedfd2c007512afa70b3d769c45b88c0d50',
    'checked': '2026-11-10',
    'checks': {'node': 55, 'deno': 19, 'strict_lint': 'pass',
               'chromium': 'form-owner/name grouping, cross-origin selected groups, peer receipts, unchanged unrelated group, stale hidden-peer refusal',
               'mcp': 'two selected groups and cleared peers, retained selection on refusal, actual states, desktop/mobile, zero submissions, acknowledged cleanup'},
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    'limits': 'Custom/ARIA choices, models, authenticated external forms, accumulated pages, edit/submission learning, assignments and wider issue scope remain unfinished. New-head hosted CI is required.',
}
names = sorted(str(path.relative_to(root)) for path in logs.glob('forms-radio-*')
               if path.is_file() and path.suffix in ['.log', '.json', '.diff'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['experiments/issue-56/collect-forms-radio.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/forms-reviewed-radios.tar.gz'
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
