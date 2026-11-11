"""Preserve an unresolved hosted failure and bounded negative reproductions."""
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
for name in ['observed', 'final']:
    log = (root / f'ci-logs/watch-disclosure-{name}.log').read_text()
    assert log.count('[question-watch] PASS ') == 5
    assert '"cases":5,"pageErrors":[],"liveProvider":false' in log
    assert '"rootOpen":true' in log
    if name == 'final':
        assert '"phase":"root-click"' in log and '"phase":"child-click"' in log
parent_log = 'ci-logs/windows-cli-current-130817278611.log'
assert 'locator.click: Timeout 15000ms exceeded' in (root / parent_log).read_text()
bundle(root, [*changed_sources(root), *evidence_logs(root, 'watch-disclosure'), parent_log],
       'docs/case-studies/issue-56/data/ci-watch-disclosure.tar.gz', {
           'parent': 'f7f634822cad51f58409325ed752495fc0fe1079',
           'failed_run': 43107866221, 'failed_job': 130817278611,
           'local_webkit_runs': 2, 'cases_per_run': 5,
           'root_cause': 'Unproven; both bounded local reproductions pass.',
           'behavior_change': False, 'deadline_seconds': 15,
           'remaining': 'Hosted recurrence evidence and every unchecked issue requirement.',
       }, 'issue-56-watch-disclosure/*.png')
