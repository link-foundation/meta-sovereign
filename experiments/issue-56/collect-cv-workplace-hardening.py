"""Retain stricter readback regressions and independent owned-browser evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-workplace-hardening')
assert 'pass 32' in read('node')
assert '32 passed | 0 failed' in read('deno')
assert 'pass 1' in read('unchecked-node')
assert '1 passed | 0 failed' in read('unchecked-deno')
assert read('replay').count('expected actual-parent failure 1') == 4
assert '[e2e-cv-save-watch] OK (webkit)' in read('browser')
assert 'All matched files use Prettier code style!' in read('static')
assert not read('lint').strip()
assert not read('secrets').strip()
assert 'ERROR' not in read('duplication')
raw = read('mcp')
result = json.loads(raw.split('### Result\n', 1)[1].split('\n', 1)[0])
assert {key: result[key] for key in ['cases', 'starts', 'stops', 'recordReads',
        'recordNavigations', 'ownerSaves', 'attachments', 'detached']} == dict(
        cases=6, starts=1, stops=1, recordReads=16,
        recordNavigations=4, ownerSaves=4, attachments=1, detached=1)
assert result['errors'] == [] and result['authenticatedProvider'] is False
assert [row['workplace']['checked'] for row in result['snapshots']] == [True, False]
assert 'Error' not in read('mcp-server')
base = 'ee7a74e466c49498ee47ece193a30e55559a65ec'
sources = changed_sources(root) + evidence_logs(root, 'cv-workplace-hardening')
sources += ['experiments/issue-56/' + name for name in [
    'parent_replay.py', 'cv-workplace-browser-fixture.mjs',
    'cv-watch-browser-fixture.mjs', 'cv-workplace-identity-fixture.mjs',
    'cv-watch-workplace-fixture.mjs']]
bundle(root, sources, 'docs/case-studies/issue-56/data/cv-workplace-hardening.tar.gz',
       dict(published_base=base, node=32, deno=32, actual_parent_failures=4,
            native_compatibility_cases=8, independent_mcp=result,
            authenticated_provider=False,
            unfinished='Exact published-head CI and every unchecked issue criterion'),
       'issue-56-cv-workplace-identity/after/*mcp*.png',
       before={name: base for name in [
           'js/src/jobs/cv-watch-verification.js',
           'js/src/jobs/cv-workplace-readback.js',
           'js/src/jobs/cv-watch-export.js']})
