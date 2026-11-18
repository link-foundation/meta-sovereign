"""Retain bounded diagnostics without declaring an unmeasured cause fixed."""
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'resume-validation')
assert 'pass 6' in read('focused') and 'fail 0' in read('focused')
assert '"cases":6' in read('native-current')
assert '"pageErrors":[]' in read('native-current')
assert '[e2e-resume-validation] OK (webkit)' in read('native-current')
assert 'Invalid résumé hash validation passed' in read('probe-final')
assert '"renderedInvalidHash":true' in read('probe-final')
assert 'All matched files use Prettier code style!' in read('format-check')
for name in ('lint', 'secrets', 'diff'):
    assert not read(name).strip(), name
assert 'ERROR:' not in read('duplication')
parent = 'c6a4834d14249cb8661967268902ffb77b04e9d6'
sources = changed_sources(root) + evidence_logs(root, 'resume-validation')
sources += ['ci-logs/checks-43591479049-webkit-4.log',
            'ci-logs/resume-validation-probe.png']
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-resume-input.tar.gz', {
    'published_parent': parent,
    'failed_sha': 'cac7f7d3fc27370d00407d22ba835e67bc958167',
    'failed_run': 43591479049, 'failed_job': 132437782294,
    'focused_node': 6, 'native_webkit_resume_cases': 6,
    'input_probe': 1, 'provider_clicks': 0, 'event_cap': 32,
    'original_cause_unresolved': True, 'production_behavior_changed': False,
    'deadlines_changed': False, 'exact_head_ci_required': True,
    'original_inventory_unchecked': 81, 'issue_complete': False,
}, 'no-resume-input-screenshots-*', before={
    'js/tests/helpers/e2e-job-resumes.mjs': parent,
})
