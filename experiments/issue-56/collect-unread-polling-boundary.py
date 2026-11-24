"""Preserve the native in-flight assertion and completed-boundary verification."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'polling')
assert 'exact full-state assertion fails at the held third pass' in read('boundary-parent-probe')
assert '+   listTop: 0' in read('boundary-parent')
assert '-   listTop: 100' in read('boundary-parent')
assert '[e2e-question-unread-polling] OK (chromium)' in read('boundary-local')
assert '"cases":5,"pageErrors":[]' in read('boundary-local')
assert 'pass 16' in read('focused-node') and 'fail 0' in read('focused-node')
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
assert 'ERROR' not in read('duplication')
hosted = (logs / 'continuation-chromium-2.log').read_text().splitlines()
assert 'AssertionError' in hosted[1632]
assert '+   listTop: 0' in hosted[1643]
assert '-   listTop: 100' in hosted[1644]
bundle(root, [*changed_sources(root), *evidence_logs(root, 'polling'),
              'ci-logs/continuation-chromium-2.log',
              'ci-logs/continuation-chromium-2.zip'],
       'docs/case-studies/issue-56/data/ci-unread-polling-boundary.tar.gz',
       dict(parent='236f42a740f35f8452279110f5679411815f628c',
            hosted_job=132238675692, hosted_assertion_line=1633,
            actual_parent_assertion_failure=True, native_cases=5,
            focused_node=16, production_algorithms_changed=False,
            original_hosted_phase_directly_captured=False,
            deadlines_increased=False, issue_complete=False,
            exact_head_ci_required=True),
       'issue-56-unread-polling-boundary/*.png',
       before={name: '236f42a7' for name in [
           'experiments/issue-56/question-browser-server.mjs',
           'js/tests/helpers/e2e-unread-polling-controls.mjs',
       ]})
