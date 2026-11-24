"""Retain bounded borrowed-visit regressions and native delivery receipts."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '3d72c6df1420d690cfdad75339426e248fd6b96a'
logs = root / 'ci-logs'


def evidence(name):
    return (logs / f'unread-delivery-visit-{name}.log').read_text()


for runtime in ('node', 'deno'):
    output = evidence(f'{runtime}-verified')
    assert ('17 passed | 0 failed' if runtime == 'deno'
            else 'pass 17') in output
for name in ('registry', 'registry-deno'):
    output = evidence(f'{name}-verified')
    assert ('1 passed | 0 failed' if name.endswith('deno')
            else 'pass 1') in output
assert 'fail 1' in evidence('before-node')
assert 'Restored the working unread source' in evidence('before')
before = json.loads(evidence('before-browser').splitlines()[-1])
assert before['outcomes'] == ['actual-parent-ignores-in-visit-delivery']
native = json.loads(evidence('browser-final').splitlines()[-1])
assert native['cases'] == 3 and native['liveProvider'] is False
assert not evidence('lint-verified').strip()
assert not evidence('secretlint-verified').strip()
assert 'ERROR' not in evidence('duplication-verified')
assert 'All matched files use Prettier code style!' in evidence('format-check-verified')

metadata = {
    'parent': parent,
    'focused_node': 17,
    'focused_deno': 17,
    'mandatory_registry_per_runtime': 1,
    'actual_parent_admission_failure': True,
    'actual_parent_native_callback_ignored': True,
    'native_production': native,
    'public_automatic_delivery': False,
    'persistent_polling': False,
    'live_account_verified': False,
    'unfinished_requirements': 'QA17, HH09, HH10 and all unchecked issue-wide criteria.',
}
bundle(root, [*changed_sources(root), *evidence_logs(root, 'unread-delivery-visit')],
       'docs/case-studies/issue-56/data/unread-delivery-visit.tar.gz', metadata,
       'issue-56-unread-delivery-visit/*.png',
       before={'js/src/sources/browser-unread-conversations.js': parent})
