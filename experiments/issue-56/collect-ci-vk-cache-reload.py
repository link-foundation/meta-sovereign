"""Preserve a negative reproduction and refusal diagnostics without claiming a fix."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = '7973fe42bff797e7c48631b19421d51b2f2789e6'
helper = 'js/tests/helpers/e2e-vk-cache.mjs'
names = [helper, 'experiments/issue-56/vk-cache-reload-probe.mjs',
         'experiments/issue-56/collect-ci-vk-cache-reload.py',
         'docs/case-studies/issue-56/ci-vk-cache-reload.md',
         'docs/case-studies/issue-56/ci-vk-cache-reload-plan.md',
         'ci-logs/checks-43799402081-webkit-4.log',
         'ci-logs/ci-7973-main-progress.json',
         'ci-logs/vk-cache-reload-probe.log',
         'ci-logs/vk-cache-reload-refusal.log']
run = json.loads((root / names[6]).read_text())
assert run['headSha'] == parent
assert any(j['name'] == 'Browser e2e (webkit, shard 4/4)' and
           j['conclusion'] == 'failure' for j in run['jobs'])
positive = (root / names[7]).read_text()
assert '"completeHistory":401' in positive and '"pageErrors":0' in positive
negative = (root / names[8]).read_text()
assert '"expectedRefusal"' in negative and 'bad-request' in negative
entries = {name: (root / name).read_bytes() for name in names}
entries[f'before/{helper}'] = subprocess.check_output(
    ['git', 'show', f'{parent}:{helper}'], cwd=root)
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-vk-cache-reload.tar.gz', entries)
