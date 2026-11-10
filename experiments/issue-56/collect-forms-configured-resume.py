"""Archive bounded public PDF-selection evidence, excluding private stores."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import tarfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 46' in (logs / 'forms-configured-resume-tests.log').read_text()
assert '46 passed | 0 failed' in (logs / 'forms-configured-resume-deno.log').read_text()
assert not (logs / 'forms-configured-resume-lint.log').read_text().strip()
assert '0 !== 1' in (logs / 'forms-configured-resume-before.log').read_text()
assert 'FAIL (chromium)' in (logs / 'forms-resume-read-before.log').read_text()
browser = (logs / 'forms-configured-resume-browser.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in browser
receipt = json.loads(next(line.split('] ', 1)[1] for line in browser.splitlines()
                          if line.startswith('[forms-configured-resume]')))
assert receipt['native'] == receipt['iframe'] == 'attached'
assert receipt['submissions'] == 0 and receipt['closed']
assert receipt['sha256'] == '89b6b1abd9be94d8896c57a64af2d45ff6c383170931885fb0be391702cf1ff9'

names = [
    'ci-logs/forms-configured-resume-tests.log',
    'ci-logs/forms-configured-resume-deno.log',
    'ci-logs/forms-configured-resume-lint.log',
    'ci-logs/forms-configured-resume-format.log',
    'ci-logs/forms-configured-resume-build.log',
    'ci-logs/forms-configured-resume-browser.log',
    'ci-logs/forms-configured-resume-before.log',
    'ci-logs/forms-resume-read-before.log',
    'ci-logs/forms-configured-resume-current-checks.json',
    'ci-logs/forms-configured-resume-head-runs.json',
    'experiments/issue-56/forms-resume-fixture.mjs',
    'experiments/issue-56/forms-reader-ui.mjs',
    'experiments/issue-56/forms-resume-read-before.mjs',
    'experiments/issue-56/collect-forms-configured-resume.py',
    'js/src/cli/forms-commands.js', 'js/src/cli/forms-resume-commands.js',
    'js/src/cli/forms-review-commands.js',
    'js/src/forms/configured-resume.js', 'js/src/forms/resume-data.js',
    'js/src/forms/resume-upload.js', 'js/src/forms/review-prefill.js',
    'js/src/forms/review-upload.js', 'js/src/server/index.js',
    'js/src/server/routes-form-resume.js', 'js/src/server/routes-forms.js',
    'js/src/server/routes-form-reviews.js', 'js/src/web/dom.js',
    'js/src/web/form-resume-api.js', 'js/src/web/form-resume-settings.js',
    'js/src/web/form-resume-upload.js', 'js/src/web/forms-api.js',
    'js/src/web/forms-view.js', 'js/tests/forms-configured-resume.test.js',
    'js/tests/forms-resume-api.test.js', 'js/tests/forms-resume-settings.test.js',
    'js/tests/e2e-forms-reader-browser.mjs',
    'js/tests/helpers/e2e-form-configured-resume.mjs',
]
names += [f'js/src/web/locales/{language}-forms.js'
          for language in ('en', 'ru', 'hi', 'zh')]
entries = {name: (root / name).read_bytes() for name in sorted(names)}
entries['metadata.json'] = (json.dumps({
    'date': '2026-11-10', 'node_checks': 46, 'deno_checks': 46,
    'preceding_head': '38b691015e238161563e87618e916b5eadfa00fc',
    'browser': receipt,
    'mcp': {
        'native': 'attached', 'sha256': receipt['sha256'],
        'submissions': 0, 'closed': True, 'phone_width': 390,
        'refused_status_before': 'No PDF is saved.',
        'refused_status_after': 'Saved PDF status is unavailable.',
        'reload_recovered': 'synthetic-resume.pdf · 599 bytes',
    },
    'remaining': 'automatic/provider workflows and unchecked issue-wide criteria remain unfinished',
    'screenshots': {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted((root / 'docs/screenshots').glob('issue-56-forms-*resume*.png'))
    },
}, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/forms-configured-resume.tar.gz'
with archive.open('wb') as raw:
    with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as saved:
            for name, data in entries.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                saved.addfile(entry, io.BytesIO(data))
with tarfile.open(archive, 'r:gz') as saved:
    hashes = {entry.name: hashlib.sha256(saved.extractfile(entry).read()).hexdigest()
              for entry in saved.getmembers() if entry.isfile()}
assert hashes == {name: hashlib.sha256(data).hexdigest() for name, data in entries.items()}
archive.with_suffix('').with_suffix('.tar.sha256.json').write_text(
    json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
print(f'Verified {len(hashes)} archive entries')
