"""Keep exact hosted failure and bounded inactive-frame regression evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'sync-isolation-ci')
verify_evidence(read, {
    'exact-parent': ['Timeout 5000ms exceeded', '"written":true,"merged":true,"replicated":true'],
    'parent-replay': ['Exact published predicate times out', 'Restored the current'],
    'polling-after': ['[e2e-sync-isolation-polling] OK (webkit)', '"merged":true,"replicated":true'],
    'native-after': ['[e2e-lino-sync] OK (webkit)', '"remainingPair":true,"pageErrors":0'],
    'format': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
head = 'c930cf39f5b55d8f77f14e94b61f995bb4b48b94'
metadata = ['ci-logs/vk-contextual-prior-last.json'] + [
    f'ci-logs/hosted-verification-c930-{run}.json'
    for run in [43673148985, 43673148794, 43673148793, 43673148811]]
for index, name in enumerate(metadata):
    run = json.loads((root / name).read_text())
    assert run['headSha'] == head and run['status'] == 'completed'
    assert run['conclusion'] == ('failure' if index == 0 else 'success')
job = (logs / 'checks-43673148877-webkit-2.log').read_text().splitlines()
assert len(job) == 1823
assert 'Timeout 5000ms exceeded' in job[1718]
sources = changed_sources(root)
bundle(root, sources + evidence_logs(root, 'sync-isolation-ci') + metadata + [
    'ci-logs/checks-43673148877-webkit-2.log'],
    'docs/case-studies/issue-56/data/ci-sync-isolation-polling.tar.gz',
    dict(published_head=head, failed_run=43673148877, failed_job=132688300301,
         exact_helper_failure=True, paused_frame_probe=True, native_webkit=True,
         deadline_ms=5000, initial_flag_delay_ms=250, full_local_matrix=False,
         original_hosted_hook_state_available=False, issue_complete=False,
         exact_head_checks_pending=True), 'no-ui-change/*.png',
    before={'js/tests/helpers/e2e-sync-receive-isolation.mjs': head})
