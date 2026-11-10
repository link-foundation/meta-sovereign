"""Verify focused choice-inspection evidence and retain deterministic raw artifacts."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'closed combobox exposes explicit choice inspection' in (logs / 'forms-choices-browser-before.log').read_text()
assert 'pass 30' in (logs / 'forms-choices-node-final.log').read_text()
assert '10 passed | 0 failed' in (logs / 'forms-choices-deno-final.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (logs / 'forms-choices-browser.log').read_text()
assert not (logs / 'forms-choices-lint-final.log').read_text()
plan = json.loads((logs / 'forms-choices-mcp-plan.json').read_text())
assert plan['fields'] == 5 and len(plan['inspectionButtons']) == 2
assert plan['selected'] == 0 and plan['applyDisabled']
assert all(not button['disabled'] for button in plan['inspectionButtons'])
opened = json.loads((logs / 'forms-choices-mcp-opened.json').read_text())
assert opened['state'] == 'opened' and opened['applyDisabled'] and opened['fields'] == 5
assert json.loads((logs / 'forms-choices-mcp-lazy.json').read_text())['state'] == 'opened'
for width, name in [(1200, 'desktop'), (390, 'mobile')]:
    value = json.loads((logs / f'forms-choices-mcp-{name}.json').read_text())
    assert value['state'] == 'applied' and not value['errors']
    assert value['width'] == value['scrollWidth'] == width
    if name == 'desktop':
        assert len(value['receipts']) == 2
        assert all(receipt['status'] == 'applied' for receipt in value['receipts'])
    else:
        assert value['receipts'] == 2
assert json.loads((logs / 'forms-choices-mcp-closed.json').read_text()) == {
    'cards': 0, 'state': 'applied', 'receipts': 2, 'errors': []}
fixture = json.loads((logs / 'forms-choices-mcp-fixture.log').read_text().splitlines()[-1])
assert fixture['submissions'] == 0 and len(fixture['reads']) == 1
read = fixture['reads'][0]
assert read['closed'] and read['events'] == ['click'] * 4
main, child = read['customFrames']
assert main['closed-work']['value'] == 'Remote' and main['work-options']['selected'] == ['remote']
assert child['lazy-language']['value'] == 'English' and child['language-options']['selected'] == ['en']
assert all(request['method'] == 'GET' for request in fixture['requests'])
annotations = json.loads((logs / 'forms-choices-radio-cancelled-annotations.json').read_text())
assert any('not acquired' in item['message'] for item in annotations)
job = json.loads((logs / 'forms-choices-radio-cancelled-job.json').read_text())
assert not job['steps'] and not job['runner_name']
changed = subprocess.check_output(['git', 'diff', '--name-only', '-z', 'a7682ac7'], cwd=root)
changed += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=root)
sources = sorted(set(name for name in changed.decode().split('\0') if name and
                     not name.startswith('docs/case-studies/issue-56/data/')))
metadata = {
    'preceding_head': 'a7682ac74ca6e49f3f0d0b4832c8fc0560c32f83',
    'checked': '2026-11-10',
    'checks': {'node': 30, 'deno': 10, 'strict_lint': 'pass',
               'chromium': 'explicit inspection, lazy cross-origin options, response recovery without replay, fresh-plan two-choice application, identical replacement refusal, zero submissions and cleanup',
               'mcp': 'five fields, two inspection actions, fresh-plan two confirmed changes, actual selected values, desktop/mobile width and zero submissions'},
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    'hosted_context': {
        'e975396a': 'Runtime failure: macOS ARM64 Bun runner acquisition failed, no steps ran. Complete check annotations and pipeline log retained. Workflow log checks-and-release-42850196977.log is PARTIAL: GitHub returned an invalid ZIP cache entry; job log unavailable.',
        'a7682ac7': 'Exact-head workflows created 16:33:09 UTC. Links, Security, Pages pass; Desktop/Checks active at capture. Latest run/job snapshots retained. This is not a passing full matrix.',
    },
    'limits': 'Unsupported menus, uploads, models, accumulated pages, stable-edit/submission learning, assignments and wider issue scope remain unfinished. New-head hosted CI required.',
}
names = sorted(str(path.relative_to(root)) for path in logs.glob('forms-choices-*')
               if path.is_file() and path.suffix in ['.log', '.json', '.diff'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['ci-logs/checks-and-release-42850196977.log', 'experiments/issue-56/collect-forms-choices.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
entries['commands.txt'] = b'''NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/forms-review-choices.test.js js/tests/forms-review-custom.test.js js/tests/forms-review-prefill.test.js js/tests/forms-report.test.js
deno test --v8-flags=--max-old-space-size=384 --allow-all --no-check js/tests/forms-review-choices.test.js js/tests/forms-report.test.js
RUN_BROWSER_E2E=1 E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome NODE_OPTIONS=--max-old-space-size=384 FORMS_CHOICES_ONLY=1 FORMS_CHOICES_SCREENSHOTS=1 node js/tests/e2e-forms-reader-browser.mjs
E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome python3 experiments/issue-56/forms-choices-before.py
E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/forms-reader-ui.mjs
'''
archive = root / 'docs/case-studies/issue-56/data/forms-reviewed-choices.tar.gz'
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
