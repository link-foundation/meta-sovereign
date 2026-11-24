"""Preserve bounded stale-tab replacement regressions and hosted failure evidence."""
import hashlib
import json
from evidence_bundle import bundle, changed_sources, evidence_context

root, logs, read = evidence_context(__file__, 'tab-merge')
assert 'pass 36' in read('focused') and 'fail 0' in read('focused')
assert 'Exact parent unit fails as expected' in read('parent-summary')
assert 'Exact parent native fails as expected' in read('parent-summary')
assert "'child-0'" in read('parent-native') and "'replacement'" in read('parent-native')
assert '[e2e-browser-merge] OK (webkit)' in read('native')
assert read('native').count('observedReplacementRetained') == 2
assert not read('lint').strip() and not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('prettier')
assert 'ERROR: jscpd' not in read('duplication')
mcp = json.loads((logs / 'tab-merge-mcp.json').read_text())
summary = mcp['content'][0]['text'].split('### Result\n', 1)[1].split('\n### Ran', 1)[0]
results = json.loads(summary)
assert not results['errors'] and len(results['results']) == 4
assert all(r['matches'] == (r['side'] == 'after') and r['durableReplacement']
           for r in results['results'])
excluded = {'tab-merge-parent-workflow.log', 'tab-merge-parent-artifact.zip'}
names = [str(p.relative_to(root)) for p in logs.glob('tab-merge-*')
         if p.is_file() and p.suffix in ('.log', '.json') and p.name not in excluded
         and not p.name.endswith(('-commit.log', '-push.log', '-archive.log', '-pr.log'))]
names.append('ci-logs/application-parent-webkit-3.log')
bundle(root, changed_sources(root) + names,
       'docs/case-studies/issue-56/data/ci-browser-observed-replacement.tar.gz',
       dict(parent='5a687049d1155fa8e233fcbaf18eafb784c300b6',
            hosted_failure_run=43530994430, hosted_failure_job=132250412027,
            focused_tests=36, local_browser='webkit', independent_mcp_cases=4,
            unchanged_retry_budget=8, full_local_matrix=False,
            exact_head_ci_required=True, issue_complete=False,
            downloaded_hashes={name: hashlib.sha256((logs / name).read_bytes()).hexdigest()
                               for name in excluded}),
       'no-ci-browser-observed-images-*',
       before={'js/src/storage/browser-coordination.js': '5a687049'})
