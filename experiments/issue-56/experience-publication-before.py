"""Reproduce missing experience publication with exact published parent files."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/jobs/cv-publication-record.js', 'js/src/jobs/cv-publication-source.js',
         'js/src/web/cv-experience-documents.js']
saved = {name: (root / name).read_bytes() for name in names}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384', RUN_BROWSER_E2E='1')

def run(name, command):
    with (root / f'ci-logs/experience-publication-{name}.log').open('w') as log:
        return subprocess.run(command, cwd=root, env=env, stdout=log,
                              stderr=subprocess.STDOUT).returncode

try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output([
            'git', 'show', f'b868a82b:{name}'], cwd=root))
    assert run('node-before', ['node', '--test', '--test-concurrency=1',
        '--test-name-pattern=experience documents are reviewed',
        'js/tests/cv-publication-experience.test.js']) != 0
    text = (root / 'ci-logs/experience-publication-node-before.log').read_text()
    assert 'jobs-cv-publication-unverified' in text, text
    assert run('build-before', ['node', 'js/scripts/build-web.mjs']) == 0
    assert run('browser-before', ['node', 'experiments/issue-56/experience-publication-browser.mjs', '--before']) == 0
finally:
    for name, data in saved.items():
        (root / name).write_bytes(data)
print('Exact parent refused the missing source; before UI captured; current sources restored.')
