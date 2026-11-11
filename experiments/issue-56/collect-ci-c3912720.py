"""Preserve exact-head failures and focused evidence for the three CI fixes."""
import json
from pathlib import Path
from evidence_bundle import bundle

repo = Path(__file__).resolve().parents[2]
logs = repo / 'ci-logs'
run = json.loads((logs / 'question-matching-parent-ci.json').read_text())
assert run['headSha'] == 'c39127200aaa7822d3fdbc7a34f993f0df205c05'
assert run['status'] == 'completed' and run['conclusion'] == 'failure'
failed = [job for job in run['jobs'] if job['conclusion'] == 'failure']
assert len(failed) == 11
job_paths = [f'ci-logs/question-matching-parent-job-{job["databaseId"]}.log' for job in failed]
for name in job_paths:
    assert (repo / name).stat().st_size > 10000, name
assert 'pass 2' in (logs / 'backup-open-race-node.log').read_text()
assert '1 pass' in (logs / 'backup-open-race-bun.log').read_text()
assert '"stalePreserved":true' in (logs / 'model-reload-browser-after.log').read_text()
assert 'OK (chromium)' in (logs / 'model-reload-browser-after.log').read_text()
independent = json.loads((logs / 'model-reload-mcp.json').read_text())
assert independent == {'disabledWhileReloading': [True, True], 'status': 200,
                       'actual': 'mcp-reviewed-model'}
local_server = json.loads((logs / 'model-reload-mcp-server.log').read_text().splitlines()[-1])
assert local_server['reads'] == [] and local_server['modelCalls'] == 0
assert local_server['submissions'] == 0
extra = ['question-matching-parent-ci.json', 'question-matching-parent-checks.log',
    'question-matching-latest-runs.json', 'question-context-regression-before.log',
    'question-matching-focused-node.log', 'question-matching-focused-deno.log',
    'backup-open-race-node.log', 'backup-open-race-bun.log',
    'model-reload-browser-after.log', 'model-reload-mcp.json',
    'model-reload-mcp-console.log', 'model-reload-mcp-server.log']
snapshots = ['js/src/storage/durable.js', 'js/src/web/answer-model-settings.js',
             'js/tests/helpers/e2e-form-model.mjs', 'js/tests/backup-stream.test.js']
prior_sources = {name: 'c3912720' for name in snapshots}
contents = [*job_paths, *[f'ci-logs/{name}' for name in extra], *snapshots,
    'js/src/automation/question-context-match.js', 'js/tests/question-context.test.js',
    'experiments/issue-56/model-reload-mcp.mjs',
    'experiments/issue-56/collect-ci-c3912720.py',
    'docs/case-studies/issue-56/ci-c3912720.md']
bundle(repo, contents, 'docs/case-studies/issue-56/data/ci-c3912720.tar.gz',
       {'date': '2026-11-11', 'run': 42934557578, 'failed_jobs': len(failed),
        'model_reload': independent, 'backup_node': 2, 'backup_bun': 1,
        'remaining': 'Exact new-head hosted matrices and every unchecked issue requirement.'},
       'issue-56-model-reload-*.png', before=prior_sources)
