"""Keep complete hosted failures and finite startup consumer evidence."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'rolling-consumer-admission')
for name, fragments in {
    'before': ['pass 1', 'fail 1', 'server/wire.js', 'storage/recovery-dump.js', 'web/discover.js'],
    'focused': ['pass 56', 'fail 0', 'skipped 0'],
    'native': ['host ready after', 'pass 1', 'fail 0', '"code":0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['Scoped source and documentation limits pass'],
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
names = [*changed_sources(root), *evidence_logs(root, 'rolling-consumer-admission'),
         'experiments/issue-56/evidence_bundle.py',
         'experiments/issue-56/cli-serve-imports.mjs',
         'experiments/issue-56/cli-import-observation.mjs',
         'experiments/issue-56/rolling-startup-profile.mjs',
         'ci-logs/rolling-consumer-imports-before.json',
         'ci-logs/rolling-consumer-imports-initial.json',
         'ci-logs/rolling-consumer-imports-after.json']
failed_source = subprocess.check_output(['git', 'rev-parse', '623a144c'], cwd=root).decode().strip()
for prefix, job_id in [('checks-623a144c-135175317759', 135175317759),
                       ('hosted-623a144c-webkit-2', 135175313302)]:
    job = json.loads((logs / f'{prefix}-job.json').read_text())
    assert job['id'] == job_id and job['head_sha'] == failed_source
    assert job['run_id'] == 44409144537 and job['conclusion'] == 'failure'
    assert (logs / f'{prefix}.log').stat().st_size > 100000
    names.extend([f'ci-logs/{prefix}.log', f'ci-logs/{prefix}-job.json'])
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in changed_sources(root):
    if name.startswith('js/') and subprocess.run(
            ['git', 'cat-file', '-e', f'024745f1:{name}'], cwd=root,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(
            ['git', 'show', f'024745f1:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'failedSource': failed_source, 'failedRun': 44409144537,
    'failedJobs': [135175317759, 135175313302],
    'actualParent': '024745f1', 'parentFailures': 1, 'parentControls': 1,
    'focusedPassed': 56, 'nativeLifecyclePassed': 1,
    'importedInternalModules': {'before': 47, 'after': 39},
    'localConcurrency': 1, 'nodeHeapMiB': 384,
    'remainingOriginalCriteria': 30, 'issueComplete': False,
    'hostedVerification': 'pending publication',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/rolling-consumer-admission.tar.gz', entries)
