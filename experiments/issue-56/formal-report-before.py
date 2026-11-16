"""The published facade cannot preview reviewed reports; always restore drafts."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/cv/index.js', 'js/src/web/cv-experience-plan-view.js']
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'83101692:{name}'], cwd=root))
    with (root / 'ci-logs/formal-report-before.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1', '--test-name-pattern=public preview binds|lost browser Start acknowledgement', 'js/tests/cv-formal-report.test.js', 'js/tests/cv-formal-report-surfaces.test.js'], cwd=root, stdout=log, stderr=subprocess.STDOUT, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'})
    log = (root / 'ci-logs/formal-report-before.log').read_text()
    assert result.returncode == 1 and 'fail 2' in log and 'previewFormalExperienceReport is not a function' in log and 'cvExperience.titleField' in log, log[-2000:]
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
print('Published facade fails the reviewed-report acceptance case; draft restored.')
