"""Finite parent regression; always restore every working source and bundle."""
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[2]
paths = [
    'js/src/automation/question-answers.js',
    'js/src/automation/question-store.js',
    'js/src/automation/automations.js',
    'js/src/automation/planning-store.js',
    'js/src/automation/runner.js',
    'js/src/automation/salary-question.js',
    'js/src/automation/question-summary.js',
    'js/src/web/app.min.js',
]
held = {path: (root / path).read_bytes() for path in paths}
try:
    for path in paths:
        data = subprocess.check_output(['git', 'show', f'7e0e2f4d:{path}'], cwd=root)
        (root / path).write_bytes(data)
    with (root / 'ci-logs/summary-choice-parent-node.log').open('w') as log:
        result = subprocess.run(['node', '--max-old-space-size=384', 'experiments/issue-56/summary-choice-parent-check.mjs'], cwd=root, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 0, 'The parent behavior probe failed'
    with (root / 'ci-logs/summary-choice-parent-ui.log').open('w') as log:
        result = subprocess.run(['node', '--max-old-space-size=384', 'experiments/issue-56/summary-choice-ui.mjs', '--before'], cwd=root, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 0, 'Inspect the preserved parent UI log'
    print('PASS: preceding planner fails recovery; real UI cannot recover the accepted option')
finally:
    for path, data in held.items():
        (root / path).write_bytes(data)
