"""Retain the actual hosted exit and a finite real-shell regression."""
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'desktop-provenance')
assert '86 !== 0' in read('parent')
assert 'pass 1' in read('focused')
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'All workflows enforce runner, deadline and checkout policy' in read('contracts')
sources = ['.github/workflows/desktop-release.yml',
           '.changeset/visible-browser-defaults.md',
           'experiments/issue-56/desktop-provenance-version.mjs',
           'experiments/issue-56/collect-desktop-provenance.py',
           'docs/case-studies/issue-56/ci-desktop-provenance.md',
           'ci-logs/native-durable-parent-desktop.log',
           'ci-logs/native-durable-parent-desktop.json']
sources += evidence_logs(root, 'desktop-provenance')
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-desktop-provenance.tar.gz',
       dict(parent='0f245481b247bdbbf622127deecd97fd095ddb8e',
            run=43492615795, exact_parent_failures=1, focused_passes=1,
            hosted_exit=-2147483644, full_local_matrix=False,
            exact_head_ci_required=True, issue_complete=False), 'no-provenance-images-*',
       before={'.github/workflows/desktop-release.yml': '0f245481'})
