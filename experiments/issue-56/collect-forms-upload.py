"""Verify focused PDF attachment evidence and retain deterministic raw artifacts."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'PDF résumé field exposes reviewed attachment' in (logs / 'forms-upload-browser-before.log').read_text()
assert 'pass 18' in (logs / 'forms-upload-node-final.log').read_text()
assert '12 passed | 0 failed' in (logs / 'forms-upload-deno.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (logs / 'forms-upload-browser-final.log').read_text()
assert '[e2e-forms-reader] OK (webkit)' in (logs / 'forms-upload-custom-webkit-local.log').read_text()
assert not (logs / 'forms-upload-lint-final.log').read_text()
plan = json.loads((logs / 'forms-upload-mcp-plan.json').read_text())
assert plan['fields'] == 5 and len(plan['uploads']) == 2
assert plan['selected'] == 0 and plan['applyDisabled'] and not plan['errors']
assert all(not control['disabled'] for control in plan['uploads'])
main = json.loads((logs / 'forms-upload-mcp-main.json').read_text())
assert main['state'] == 'attached' and main['applyDisabled'] and main['uploadActions'] == 0
for width, name in [(1200, 'desktop'), (390, 'mobile')]:
    value = json.loads((logs / f'forms-upload-mcp-{name}.json').read_text())
    assert value['state'] == 'attached' and not value['errors']
    assert value['width'] == value['scrollWidth'] == width
assert json.loads((logs / 'forms-upload-mcp-closed.json').read_text()) == {
    'cards': 0, 'state': 'attached', 'errors': []}
fixture = json.loads((logs / 'forms-upload-mcp-fixture.log').read_text().splitlines()[-1])
assert fixture['submissions'] == 0 and len(fixture['reads']) == 1
read = fixture['reads'][0]
assert read['closed'] and read['events'] == ['input', 'change'] * 2
main, child = read['uploadFrames']
assert main['resume-name'] == 'Owner text' and main['portrait'] == main['multiple-resume'] == []
pdf = (logs / 'synthetic-resume.pdf').read_bytes()
metadata = {'name': 'synthetic-resume.pdf', 'size': len(pdf), 'type': 'application/pdf',
            'sha256': hashlib.sha256(pdf).hexdigest()}
assert main['main-resume'] == child['child-resume'] == [metadata]
assert all(request['method'] == 'GET' for request in fixture['requests'])
ci = json.loads((logs / 'forms-upload-custom-ci-final.json').read_text())
assert ci['headSha'].startswith('a7682ac7') and ci['conclusion'] == 'failure'
assert 'custom changes read back' in (logs / 'forms-upload-custom-webkit-final.log').read_text()
for name in ['broken-links-42859450035.log', 'broken-links-42859450035-attempt-2.log',
             'broken-links-42859450035-attempt-3.log']:
    assert '[503]' in (logs / name).read_text()
changed = subprocess.check_output(['git', 'diff', '--name-only', '-z', '32253199'], cwd=root)
changed += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=root)
sources = sorted(set(name for name in changed.decode().split('\0') if name and
                     not name.startswith('docs/case-studies/issue-56/data/')))
evidence = {
    'preceding_head': '322531999fa34c53355d48d54121b33f3bdbf875',
    'checked': '2026-11-10',
    'checks': {'node': 18, 'deno': 12, 'strict_lint': 'pass',
               'chromium': 'chosen PDF, existing-file permission, actual cross-origin digest readback, cached no replay, identical replacement refusal, zero submissions and cleanup',
               'webkit': 'focused custom-control flow passes; hosted refusal cause remains unproven',
               'mcp': 'five fields, two explicit chooser attachments with fresh plans, actual byte hashes, desktop/mobile width and zero submissions'},
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    'hosted_context': {
        'a7682ac7': 'Checks failed: WebKit Forms refused before any selected write. Complete workflow and job logs retained. Other runtime/native jobs passed.',
        '32253199': 'Three Links attempts fail with changing GitHub HTTP 503 URLs; exact-head snapshots retained. Checks still active. No full-matrix pass claimed.',
    },
    'limits': 'Configured/default PDF selection, models, accumulated pages, learning, assignments and wider issue scope remain unfinished. New-head CI required.',
}
names = sorted(str(path.relative_to(root)) for path in logs.glob('forms-upload-*')
               if path.is_file() and path.suffix in ['.log', '.json', '.diff'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['ci-logs/checks-and-release-42855655761.log', 'ci-logs/broken-links-42859450035.log',
          'ci-logs/broken-links-42859450035-attempt-2.log', 'ci-logs/broken-links-42859450035-attempt-3.log',
          'ci-logs/synthetic-resume.pdf', 'experiments/issue-56/collect-forms-upload.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps(evidence, indent=2) + '\n').encode()
entries['commands.txt'] = b'''NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/forms-review-upload.test.js js/tests/forms-review-choices.test.js js/tests/forms-report.test.js
deno test --v8-flags=--max-old-space-size=384 --allow-all --no-check js/tests/forms-review-upload.test.js js/tests/forms-report.test.js
RUN_BROWSER_E2E=1 E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome NODE_OPTIONS=--max-old-space-size=384 FORMS_UPLOAD_ONLY=1 FORMS_UPLOAD_SCREENSHOTS=1 node js/tests/e2e-forms-reader-browser.mjs
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit CI_BROWSER_DEBUG=1 NODE_OPTIONS=--max-old-space-size=384 FORMS_CUSTOM_ONLY=1 node js/tests/e2e-forms-reader-browser.mjs
E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome python3 experiments/issue-56/forms-upload-before.py
E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/forms-reader-ui.mjs
'''
archive = root / 'docs/case-studies/issue-56/data/forms-reviewed-upload.tar.gz'
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
