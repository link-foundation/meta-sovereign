"""Retain finite public unread-review admission, latest-turn and native evidence."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '08cff80a803331a9b84e77d6874a8d528da59abd'
logs = root / 'ci-logs'


def evidence(name):
    return (logs / f'question-unread-{name}.log').read_text()


def confirmed_checks(name, count):
    output = evidence(name)
    if name.startswith('deno'):
        assert f'{count} passed | 0 failed' in output, name
    else:
        assert f'pass {count}' in output and 'fail 0' in output, name


confirmed_checks('node-verified', 43)
confirmed_checks('deno-verified', 43)
confirmed_checks('contracts', 3)
confirmed_checks('deno-contracts-final', 3)
before = evidence('before-node')
assert 'fail 2' in before and 'pass 0' in before
assert 'Restored all five working files' in evidence('before-summary')
assert '"missingUnreadControls":true' in evidence('before-browser')
assert '"cases":5,"pageErrors":[],"liveProvider":false' in evidence('browser-verified')

independent = evidence('mcp-verified')
receipt = json.loads(independent.split('### Result\n', 1)[1].split('\n', 1)[0])
assert len(receipt['cases']) == 6 and receipt['pageErrors'] == []
assert receipt['scans'] == 6 and receipt['senderStub'] is True
for boundary in ('pending', 'sends', 'prefills', 'reads'):
    assert receipt[boundary] == 0, boundary
assert receipt['liveProvider'] is False
assert not evidence('lint-verified').strip()
assert not evidence('secretlint-verified').strip()
assert 'ERROR' not in evidence('duplication-verified')
assert 'All matched files use Prettier code style!' in evidence('format-check')

screenshots = sorted((root / 'docs/screenshots/issue-56-question-unread-review').glob('*.png'))
assert len(screenshots) >= 11
assert all(path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') for path in screenshots)
sources = [*changed_sources(root), *evidence_logs(root, 'question-unread')]
metadata = {
    'parent': parent,
    'focused_node': 43,
    'focused_deno': 43,
    'locale_and_registry_per_runtime': 3,
    'actual_parent_failures': 2,
    'native_production_ui_cases': 5,
    'independent_mcp': receipt,
    'coverage_complete': False,
    'persistent_polling': False,
    'automatic_delivery': False,
    'live_account_verified': False,
    'unfinished_requirements': 'QA17, HH09, HH10 and all unchecked issue-wide criteria.',
}
before_paths = (
    'js/src/automation/question-browser.js',
    'js/src/web/question-browser-api.js',
    'js/src/web/question-browser-controls.js',
    'js/src/sources/browser-conversation-history.js',
)
bundle(root, sources, 'docs/case-studies/issue-56/data/question-unread-review.tar.gz',
       metadata, 'issue-56-question-unread-review/*.png',
       before={name: parent for name in before_paths})
