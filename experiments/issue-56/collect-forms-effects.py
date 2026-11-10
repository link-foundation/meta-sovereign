"""Preserve the duplication failure and focused guarded-effect verification."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import tarfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 28' in (logs / 'forms-effects-node.log').read_text()
assert '28 passed | 0 failed' in (logs / 'forms-effects-deno.log').read_text()
assert not (logs / 'forms-effects-lint-final.log').read_text().strip()
assert '34683 (6.49%)' in (logs / 'forms-effects-duplication-final.log').read_text()
for flow in ['choices', 'upload', 'custom']:
    assert 'OK (chromium)' in (logs / f'forms-effects-{flow}-browser.log').read_text()
names = [str(path.relative_to(root)) for path in logs.glob('forms-effects-*.log')
         if not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log'))]
names += [f'ci-logs/{name}' for name in [
    'checks-and-release-42862113702.log', 'checks-and-release-42862616182.log',
    'broken-links-42862113783.log', 'broken-links-42862614721.log',
    'forms-history-initial-runs.json', 'forms-history-pdf-checks.json',
    'forms-effects-current-checks.json', 'forms-effects-self-review.diff']]
names += ['js/src/forms/review-effect.js', 'js/src/forms/review-disclosure.js',
          'js/src/forms/review-upload.js', 'js/tests/helpers/forms-review-http.mjs',
          'js/tests/helpers/e2e-form-review.mjs', '.jscpd.json',
          'experiments/issue-56/collect-forms-effects.py']
names += [f'js/tests/forms-review-{name}.test.js' for name in ['upload', 'choices', 'prefill']]
names += [f'js/tests/helpers/e2e-form-{name}.mjs' for name in ['upload', 'choices', 'custom']]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps({
    'date': '2026-11-10', 'preceding_head': 'c6ad8846',
    'node_checks': 28, 'deno_checks': 28, 'chromium_flows': 3,
    'duplication': '34683/534102 lines (6.49%); unchanged 6.5% gate',
    'hosted': 'next exact-head matrix required; preceding link run passes',
    'limits': 'all unverified issue-wide and form criteria remain required',
}, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/ci-forms-effects.tar.gz'
with archive.open('wb') as raw:
    with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as tar:
            for name, data in entries.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
with tarfile.open(archive, 'r:gz') as tar:
    hashes = {entry.name: hashlib.sha256(tar.extractfile(entry).read()).hexdigest()
              for entry in tar.getmembers() if entry.isfile()}
assert hashes == {name: hashlib.sha256(data).hexdigest() for name, data in entries.items()}
archive.with_suffix('').with_suffix('.tar.sha256.json').write_text(
    json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
print(f'Verified {len(hashes)} archive entries')
