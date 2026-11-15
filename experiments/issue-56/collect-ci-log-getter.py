"""Check actual Windows failure and finite parent/current error-format evidence."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs, bundle,
)

root, logs, read = evidence_context(__file__, 'ci-log-getter')
verify_evidence(read, {
    'node': ['pass 18', 'fail 0', 'cancelled 0'],
    'bun': ['18 pass', '0 fail'],
    'deno': ['18 passed | 0 failed'],
    'before-node': ['1 !== 0', 'fail 1'],
    'before-prefix': ['true !== false', 'fail 1'],
    'format-final': ['All matched files use Prettier code style!'],
})
assert all('SyntaxError' not in read(name) for name in ('before-node', 'before-prefix'))
ci = json.loads((logs / 'message-defaults-desktop-run.json').read_text())
assert ci['headSha'] == '54c952479634ce8a589b2a19c2e4a83f991d0387'
hosted = {
    'desktop-head-bun-windows-132908490131.log': '6497 pass',
    'priority-head-bun-windows-132913449590.log': '6504 pass',
}
for name, passing in hosted.items():
    content = (logs / name).read_text()
    assert '(fail) log formatting avoids getters, toJSON and cycles' in content
    assert 'true !== false' in content and passing in content and '13 skip' in content
cancelled = sorted(logs.glob('desktop-head-43744999725-*.log'))
cancelled = [p for p in cancelled if len(p.read_text().splitlines()) > 10]
assert len(cancelled) == 4
assert all('The operation was canceled.' in p.read_text() for p in cancelled)
sources = changed_sources(root)
extra = [str(p.relative_to(root)) for p in cancelled]
extra += [f'ci-logs/{name}' for name in hosted]
extra += ['ci-logs/message-defaults-desktop-run.json', 'ci-logs/logger-current-runs.json']
parent = '514c524fef426b3abd0a305b59b084fe759e37cd'
bundle(root, sources + evidence_logs(root, 'ci-log-getter') + extra,
       'docs/case-studies/issue-56/data/ci-log-getter.tar.gz', {
           'parent': parent, 'node_passed': 18, 'bun_passed': 18, 'deno_passed': 18,
           'hosted_failure_runs': [43744999725, 43746863135],
           'cancelled_browser_jobs_are_not_passes': True,
           'native_windows_exercised_locally': False, 'live_provider_effects': 0,
           'inventory_rows': 118, 'unchecked_inventory_rows': 60,
           'hosted_verification_pending': True, 'issue_complete': False,
       }, 'issue-56-ci-log-getter/*.png', before={
           'js/src/server/log-value.js': parent,
           'js/src/server/redact.js': parent,
       })
