"""Preserve finite publication proofs without user repositories or credentials."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs, verify_evidence

root, logs, read = evidence_context(__file__, 'cv-publication')
verify_evidence(read, {
    'before': ['pass 0', 'fail 1', 'cv-publish-plan is not a function'],
    'node': ['pass 29', 'fail 0'],
    'deno': ['19 passed | 0 failed'],
    'browser': ['localSnapshotPushes', 'privateIndexPreserved', 'recoveryReplayed', 'OK (chromium)'],
    'format-check': ['All matched files use Prettier code style!'],
})
mcp = json.loads((logs / 'cv-publication-mcp-published.json').read_text())
assert mcp['state'] == 'published' and mcp['publishDisabled'] and mcp['destinationVisible']
assert not any(mcp[key] for key in ['consent', 'overflow', 'privateContact', 'tutorialOpen'])
server = [json.loads(line) for line in (logs / 'cv-publication-mcp-server.log').read_text().splitlines()]
assert server[-1]['pushes'] == 1 and server[-1]['resourcesClosed'] and not server[-1]['realProvider']
recovered = json.loads((logs / 'cv-publication-mcp-recovered.json').read_text())
assert recovered['state'] == 'published' and recovered['publishDisabled'] and not recovered['consent']
packed = json.loads((logs / 'cv-publication-pack.json').read_text())[0]
assert any(row['path'] == 'js/src/jobs/cv-publication-git.js' for row in packed['files'])
sources = changed_sources(root) + evidence_logs(root, 'cv-publication', ('.log', '.json', '.yml', '.txt')) + [
    'ci-logs/resume-publication-reference-readme.md',
    'ci-logs/resume-publication-cv-store.mjs',
    'ci-logs/publication-current-runs.json',
    'ci-logs/publication-current-jobs.json',
    'experiments/issue-56/cv-watch-fixture.mjs',
]
bundle(root, sources, 'docs/case-studies/issue-56/data/cv-publication.tar.gz',
       dict(parent='4c06685abbb553607b64677a84512ab19a66d732', focused_node=29,
            focused_deno=19, parent_failures=1, native_local_pushes=2,
            mcp_local_pushes=1, provider_sessions=0, private_index_preserved=True,
            status_replayed=False, remaining_original_inventory_rows=81,
            issue_complete=False),
       'issue-56-cv-publication/*.png',
       before={'js/src/jobs/service.js': '4c06685a'})
