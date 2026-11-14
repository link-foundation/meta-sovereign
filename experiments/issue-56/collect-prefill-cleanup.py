"""Preserve the hosted evidence and bounded pending-cleanup regression."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'captcha-status')
parent = '57bb7360387b274fd0098f01f54de17b9559b32e'
assert 'pass 34' in read('node-verified')
assert '34 passed | 0 failed' in read('deno-verified')
assert read('parent-replay').splitlines() == [
    'parent-unit: expected exit 1', 'parent-browser: expected exit 1']
assert 'form-prefill-unknown' in read('parent-unit')
assert 'fresh status read during held cleanup' in read('parent-browser')
assert '"state":"prefilling","ok":true,"complete":false' in read('parent-browser')
assert '"pending":true,"receipts":1' in read('webkit-verified')
assert '"state":"prefilling","ok":false,"complete":false' in read('webkit-verified')
assert 'OK (webkit)' in read('webkit-verified')
assert not read('lint').strip()
assert not read('secretlint').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'ERROR' not in read('duplication')
proof = json.loads((logs / 'captcha-status-mcp.json').read_text())
assert proof['waiting'] == dict(state='waiting-owner', closeEnabled=True, overlay=0)
assert proof['completed'] == dict(state='prefilled', ok=True, complete=True,
                                receipts=1, submissionAttempted=False, closed=True)
actual = json.loads(read('mcp-server').splitlines()[-1])
assert actual['submissions'] == 0 and len(actual['reads']) == 1
owned = actual['reads'][0]
assert owned['closed'] and owned['events'] == [dict(name='input', target='email')]
assert owned['captcha'] == dict(challengeReads=0, ownerReleases=1, email='ada@example.test')
bundle(root, [*changed_sources(root), *evidence_logs(root, 'captcha-status'),
              'ci-logs/resume-list-published-run-43156663984.log',
              'ci-logs/resume-list-published-webkit-job-130979772788.log',
              'ci-logs/captcha-status-webkit-artifact.zip'],
       'docs/case-studies/issue-56/data/ci-prefill-cleanup.tar.gz',
       dict(parent=parent, failed_head='56419934dcefb3c4acd319a9b04f2812038c7565',
            failed_run=43156663984, failed_job=130979772788,
            focused_per_runtime=34, mcp=proof, actual=actual,
            production_limits_changed=False,
            unfinished='Exact new-head CI and every unchecked issue criterion'),
       'issue-56-prefill-cleanup/*.png', before={name: parent for name in (
           'js/src/forms/automatic-prefill.js', 'js/src/forms/prefill-control.js',
           'js/src/web/form-automatic-result.js')})
