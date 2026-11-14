"""Preserve two exact-head CI failures without claiming original issue completion."""
import json
from evidence_bundle import bundle, evidence_context

root, logs, read = evidence_context(__file__, 'unread-reveal')
parent = 'e8533c0c478ee997c3974caf63798bd74e1619f3'
assert 'browser-chat-view-chat-unavailable' in read('before')
assert 'OK (chromium)' in read('native-final')
assert read('native-final').count('"phase":"passed"') == 2
assert 'pass 20' in read('node-final') and 'fail 0' in read('node-final')
response = json.loads((logs / 'unread-reveal-mcp-final.json').read_text())
assert response.get('isError') is not True
report = '\n'.join(item.get('text', '') for item in response['content'])
assert all(fragment in report for fragment in (
    '"cases":2', '"revealReleased":true', '"restored":true',
    '"reason":"owner-active"', '"pageErrors":[]', '"liveProvider":false'))
for label in ('lint-final', 'secrets-final', 'diff-final'):
    assert not (logs / f'resume-language-{label}.log').read_text().strip()
assert 'All matched files use Prettier code style!' in (logs / 'resume-language-format-check-final.log').read_text()
assert 'ERROR:' not in (logs / 'resume-language-duplication-final.log').read_text()
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
shared = [
    'experiments/issue-56/collect-ci-reveal-groups.py',
    'docs/case-studies/issue-56/PLAN.md',
    'ci-logs/resume-language-parent-ci-status.json',
    *[f'ci-logs/resume-language-{label}.log' for label in (
        'lint-final', 'secrets-final', 'diff-final', 'format-check-final', 'duplication-final')],
]
reveal = [
    'js/src/sources/browser-chat-navigation.js',
    'js/tests/e2e-question-unread-guards-browser.mjs',
    'js/tests/helpers/e2e-chat-navigation.mjs',
    'js/tests/helpers/e2e-chat-navigation-race.mjs',
    'experiments/issue-56/unread-reveal-native.mjs',
    'experiments/issue-56/unread-reveal-before.py',
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/chat-navigation-mcp.mjs',
    'docs/case-studies/issue-56/ci-unread-reveal.md',
    'ci-logs/resume-language-parent-chromium-132370298746.log',
    *[str(path.relative_to(root)) for path in logs.glob('unread-reveal-*') if path.is_file()],
    *[str(path.relative_to(root)) for path in (logs / 'resume-language-parent-chromium-artifact').rglob('*') if path.is_file()],
    *[str(path.relative_to(root)) for path in (root / 'docs/screenshots/issue-56-unread-reveal').glob('*.png')],
]
metadata = dict(parent=parent, run=43569152391, original_inventory_unchecked=81,
                issue_complete=False, exact_head_ci_still_required=True)
bundle(root, shared + reveal, 'docs/case-studies/issue-56/data/ci-unread-reveal.tar.gz',
       dict(metadata, job=132370298746, native_cases=2, mcp_cases=2, node_checks=20,
            original_hosted_render_timing_measured=False, authenticated_provider=False),
       'issue-56-unread-reveal/*.png', before={'js/src/sources/browser-chat-navigation.js': parent})
assert 'combines 11 native scenarios' in (logs / 'application-groups-before.log').read_text()
assert 'pass 5' in (logs / 'application-groups-node-final.log').read_text()
groups = [
    'js/scripts/browser-checks.json', 'package.json',
    'js/tests/ci-browser-shards.test.js',
    'js/tests/e2e-job-application-browser.mjs',
    'js/tests/e2e-job-application-drafts-browser.mjs',
    'js/tests/e2e-job-application-policies-browser.mjs',
    'docs/case-studies/issue-56/ci-application-groups.md',
    'ci-logs/application-groups-before.log', 'ci-logs/application-groups-node-final.log',
    'ci-logs/resume-language-parent-webkit-132370299236.log',
    *[str(path.relative_to(root)) for path in (logs / 'resume-language-parent-webkit-artifact').rglob('*') if path.is_file()],
]
bundle(root, shared + groups, 'docs/case-studies/issue-56/data/ci-application-groups.tar.gz',
       dict(metadata, job=132370299236, group_timeout_ms=180000, group_sizes=[4, 3, 4],
            mandatory_engines=['chromium', 'webkit'], runner_checks=5,
            individual_scenario_hang_established=False),
       'ci-application-groups-*.png', before={'js/tests/e2e-job-application-browser.mjs': parent})
