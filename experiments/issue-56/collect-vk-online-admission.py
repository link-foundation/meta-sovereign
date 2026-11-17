"""Check and preserve the finite online refresh admission regression."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'vk-online-admission')
verify_evidence(read, {
    'before-final': ['fail 15', 'pass 5', 'fifteen actual-parent admission refusals reproduce'],
    'node-final': ['pass 34', 'fail 0'],
    'deno-final': ['34 passed | 0 failed'],
    'ack-node': ['pass 20', 'fail 0'],
    'ack-deno': ['20 passed | 0 failed'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['0 over the 1500 line limit'],
})
names = [*changed_sources(root), *evidence_logs(root, 'vk-online-admission'),
         'experiments/issue-56/evidence_bundle.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['js/src/automation/vk-online.js', 'js/src/sources/vk.js']:
    entries['before/' + name] = subprocess.check_output(
        ['git', 'show', f'5f982b17:{name}'], cwd=root)
entries['metadata.json'] = json.dumps(dict(parent='5f982b17', acceptance=False,
    nodeChecks=34, denoChecks=34, admissionCases=20, failingParentCases=15,
    positiveControls=5, liveProvider=False, unfinishedCriteria=40)).encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vk-online-admission.tar.gz', entries)
