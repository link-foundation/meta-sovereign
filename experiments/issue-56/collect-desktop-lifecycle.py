"""Verify finite desktop lifecycle failures and focused cross-runtime checks."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs, bundle,
)

root, logs, read = evidence_context(__file__, 'desktop-lifecycle')
verify_evidence(read, {
    'node': ['pass 16', 'fail 0', 'cancelled 0'],
    'deno': ['16 passed | 0 failed'],
    'format-final': ['All matched files use Prettier code style!'],
    'before': ['macOS Quit must be held for draining',
               'failed startup must close the already opened server'],
})
before = json.loads(read('before').splitlines()[0])
after = json.loads(read('after'))
assert all(not item['passed'] and item['calls']['closes'] == 0
           for item in before['result'])
assert all(item['passed'] for item in after['result'])
assert before['before'] is True and after['before'] is False
assert after['realElectron'] is False and after['liveProvider'] is False
bundle(root, changed_sources(root) + evidence_logs(root, 'desktop-lifecycle'),
       'docs/case-studies/issue-56/data/desktop-lifecycle.tar.gz', {
           'parent': after['parent'], 'node_passed': 16, 'deno_passed': 16,
           'real_electron_exercised': False, 'live_provider_effects': 0,
           'unchecked_inventory_rows': 60, 'inventory_rows': 118,
           'hosted_verification_pending': True, 'issue_complete': False,
       }, 'issue-56-desktop-lifecycle/*.png',
       before={'js/electron/main.js': after['parent']})
