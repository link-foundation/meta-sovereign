"""Verify and retain focused exposed-ARIA control evidence without a broad build."""
from pathlib import Path
from evidence_bundle import write_entries_archive
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'custom radio option can be reviewed' in (logs / 'forms-custom-browser-before.log').read_text()
assert 'pass 60' in (logs / 'forms-custom-node-final.log').read_text()
assert '24 passed | 0 failed' in (logs / 'forms-custom-deno-final.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (logs / 'forms-custom-browser.log').read_text()
assert not (logs / 'forms-custom-lint-final.log').read_text()
before_popup = json.loads((logs / 'forms-custom-popup-before.log').read_text().splitlines()[0])
after_popup = json.loads((logs / 'forms-custom-popup-after.log').read_text().splitlines()[0])
assert before_popup == {'beforeExcluded': 1, 'afterExcluded': 2, 'beforeFields': 13, 'afterFields': 13}
assert after_popup == dict(before_popup, afterExcluded=1)
assert 'Protected native input stays omitted' in (logs / 'forms-custom-popup-after.log').read_text()
plan = json.loads((logs / 'forms-custom-mcp-plan.json').read_text())
assert plan['fields'] == 14 and len(plan['selectable']) == 6 and len(plan['effects']) == 1
assert all(not field['checked'] for field in plan['selectable']) and plan['applyDisabled']
refused = json.loads((logs / 'forms-custom-mcp-refused.json').read_text())
assert refused['code'] == 'form-existing-value' and refused['selected'] == 6
for width, name in [(1200, 'desktop'), (390, 'mobile')]:
    value = json.loads((logs / f'forms-custom-mcp-{name}.json').read_text())
    assert value['state'] == 'applied' and not value['errors']
    assert value['width'] == value['scrollWidth'] == width
    if name == 'desktop':
        assert len(value['receipts']) == 6 and len(value['effects']) == 1
        assert all(item['status'] == 'applied' for item in value['receipts'] + value['effects'])
    else:
        assert value['receipts'] == 6 and value['effects'] == 1
closed = json.loads((logs / 'forms-custom-mcp-closed.json').read_text())
assert closed == {'cards': 0, 'state': 'applied', 'receipts': 6, 'effects': 1, 'errors': []}
fixture = json.loads((logs / 'forms-custom-mcp-fixture.log').read_text().splitlines()[-1])
assert fixture['submissions'] == 0 and len(fixture['reads']) == 1
read = fixture['reads'][0]
assert read['closed'] and read['events'] == ['input', 'click', 'click', 'click', 'click', 'input']
main, child = read['customFrames']
assert main['custom-name']['value'] == 'Ada Example'
assert main['custom-updates']['checked'] == main['custom-remote']['checked'] == 'true'
assert main['custom-office']['checked'] == 'false'
assert main['custom-language']['selected'] == ['en']
assert main['custom-arrangement']['value'] == 'Remote'
assert main['arrangement-list']['selected'] == ['remote']
assert child['custom-city']['value'] == 'Vietnam, UTC+7'
assert all(main[key]['checked'] == 'false' for key in ['hidden-group-remote', 'owned-group-remote', 'submit-trap'])
assert main['outside-option']['checked'] == 'true' and main['unknown-check']['checked'] is None
assert main['hidden-choice']['selected'] == ['hi'] and main['duplicate-choice']['selected'] == ['same']
assert all(request['method'] == 'GET' for request in fixture['requests'])
assert '[e2e-forms-reader] OK (webkit)' in (logs / 'forms-custom-prefill-webkit.log').read_text()
changed = subprocess.check_output(['git', 'diff', '--name-only', '-z', 'e975396a'], cwd=root)
changed += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=root)
sources = sorted(set(name for name in changed.decode().split('\0') if name and
                     not name.startswith('docs/case-studies/issue-56/data/')))
metadata = {
    'preceding_head': 'e975396a145ae5a54aa0f51ff2dc5486e7fdf07e',
    'checked': '2026-11-10',
    'checks': {'node': 60, 'deno': 24, 'strict_lint': 'pass',
               'chromium': 'six reviewed custom writes, cross-origin readback, cleared peer, identical-option replacement refused before interaction',
               'mcp': 'fourteen fields, six selected changes plus one cleared peer, actual states, desktop/mobile, zero submissions, acknowledged cleanup'},
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in sources},
    'hosted_context': {
        'afaf8bed': 'Forms passed in the complete WebKit job log; later job cancellation and aggregate cancelled/abandoned dependencies are not a passing workflow. checks-and-release-42846576996.log is partial because native job 129935893598 logs were unavailable.',
        'e975396a': 'Four auxiliary workflows pass; runtime matrix remains running at capture with the macOS Bun job cancelled. GitHub refuses that job log until workflow completion; refusal preserved. Broken links initially failed on upstream HTTP 503 and the same-head failed-job rerun passes.',
    },
    'limits': 'Unknown menus, uploads, models, authenticated external forms, accumulated pages, edit/submission learning, assignments and wider issue scope remain unfinished. New-head hosted CI is required.',
}
names = sorted(str(path.relative_to(root)) for path in logs.glob('forms-custom-*')
               if path.is_file() and path.suffix in ['.log', '.json', '.diff'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['ci-logs/broken-links-42850196906.log', 'ci-logs/checks-and-release-42846576996.log',
          'experiments/issue-56/collect-forms-custom.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
archive = root / 'docs/case-studies/issue-56/data/forms-reviewed-custom.tar.gz'
write_entries_archive(archive, entries, len(sources))
