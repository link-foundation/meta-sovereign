"""Archive passive native Save observation and exact-parent CI evidence."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'cv-watch')
assert 'pass 21' in read('node-final')
assert '21 passed | 0 failed' in read('deno-final')
assert 'pass 24' in read('compatibility-final')
assert 'pass 1' in read('ci-contracts')
assert not read('lint-final').strip()
assert 'All matched files use Prettier code style!' in read('static-final')
assert not read('secrets-final').strip()
assert 'ERROR' not in read('duplication')
assert read('before').count('expected actual-parent failure 1') == 2
assert 'A delayed pre-Stop status must not restore active observation' in read('late-read-before')
assert '"result":{"cases":4,"attachments":1,"detached":1' in read('webkit-final')
assert '"result":{"cases":2,"verifiedWorkplace":true,"mismatchRetained":true}' in read('webkit-final')
assert json.loads(read('cdp').strip()) == dict(
    cases=2, exactNativeTarget=True, ownerTabOpen=True, extraProviderRequests=0)
assert json.loads(read('mcp').splitlines()[1]) == dict(
    cases=4, startPosts=1, stopPosts=1, attached=1, detached=1,
    reads=1, nativeProvider=False, errors=[])
base = '15f9c3e898805c91ca6f54a142fb279f89d598e2'
ci = json.loads((logs / 'cv-watch-parent-checks.json').read_text())
assert ci['headSha'] == base and ci['conclusion'] == 'failure'
sources = changed_sources(root, base) + evidence_logs(root, 'cv-watch')
sources += evidence_logs(root, 'hh-cv-editor-reference', ('.mjs',))
sources += ['ci-logs/hh-technology-reference-tree.json']
sources += [str(path.relative_to(root)) for path in sorted(
    (logs / 'cv-watch-parent-webkit2-artifacts').rglob('*')) if path.is_file()]
bundle(root, sources, 'docs/case-studies/issue-56/data/cv-save-watch.tar.gz',
       dict(published_base=base, regression_parent=base, node_tests=21,
            deno_tests=21, compatibility_tests=24, ci_contracts=1,
            native_browser_cases=6, native_cdp_cases=2, mcp_cases=4,
            mcp_native_provider=False, expected_parent_failures=2,
            reference=dict(repository='konard/hh-job-application-automation',
                           commit='fa0991b8c2d0896fb3b4be6c69947f0590094b15'),
            hosted=dict(commit=base, run=43183721390,
                        created='2026-11-12T08:32:01Z',
                        failed_runtime_jobs=9, failed_webkit_job=131069572747,
                        native_macos_keyboard_confirmed=True),
            unfinished='Shared-record identity and complete cross-CV membership, native editor/preparation, durable batches, authenticated HH parity, bilingual provider writes, Follow Backlinks CI visibility, exact new-head CI and every unchecked issue criterion'),
       'issue-56-cv-save-watch/**/*.png',
       before={name: base for name in ['js/src/jobs/service.js',
                                      'js/src/web/app.min.js']})
