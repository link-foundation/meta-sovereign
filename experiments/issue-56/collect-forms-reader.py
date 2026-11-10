"""Preserve finite Forms regressions, browser observations and exact source hashes."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
names = sorted(str(path.relative_to(root)) for path in
               (root / 'ci-logs').glob('forms-reader-*')
               if path.is_file() and path.suffix in ['.log', '.json'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['ci-logs/question-concurrency-issue56.json',
          'experiments/issue-56/collect-forms-reader.py']
assert 'assertion failed: shared Forms navigation exists' in (root / 'ci-logs/forms-reader-browser-before.log').read_text()
assert 'browser rejects an invalid slot before a read' in (root / 'ci-logs/forms-reader-validation-before.log').read_text()
assert 'pass 73' in (root / 'ci-logs/forms-reader-node-final.log').read_text()
assert 'pass 30' in (root / 'ci-logs/forms-reader-node-focused-final.log').read_text()
assert '13 passed | 0 failed' in (root / 'ci-logs/forms-reader-deno.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (root / 'ci-logs/forms-reader-browser-final.log').read_text()
assert not (root / 'ci-logs/forms-reader-lint-final.log').read_text()
mcp = json.loads((root / 'ci-logs/forms-reader-mcp-report.json').read_text())
assert mcp['fields'] == 15 and 'Location' in mcp['labels'] and mcp['error'] is None
assert json.loads((root / 'ci-logs/forms-reader-mcp-slot.json').read_text())['valid'] is False
assert json.loads((root / 'ci-logs/forms-reader-mcp-mobile.json').read_text())['width'] == [390, 390]
fixture = json.loads((root / 'ci-logs/forms-reader-mcp-fixture.log').read_text().splitlines()[-1])
assert fixture['submissions'] == 0 and all(read['closed'] and not read['events'] for read in fixture['reads'])
changed = subprocess.check_output(
    ['git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
sources = sorted(set(name for name in changed if name and
                     not name.startswith('docs/case-studies/issue-56/data/')))
metadata = {
    'preceding_head': '4ed3f9c58c31e7f0495b3df8882ab6a01c7da610',
    'checked': '2026-11-10',
    'checks': {'node': 73, 'node_final_subset': 30, 'deno': 13,
               'chromium': 'production read/export/refusal/retry/caps/mobile pass',
               'mcp': '15 fields, cross-origin frame, validation, 390px, owned shutdown'},
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                for name in sources},
    'limits': 'Synthetic read-only current-page inspection. Planning, prefilling, persistent review slots, multipage/submission/edit learning and broader issue criteria remain open. New-head CI required.',
}
archive = root / 'docs/case-studies/issue-56/data/forms-reader.tar.gz'
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
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
