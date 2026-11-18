"""Preserve actual hosted failure and finite native disclosure evidence."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
before = (logs / 'watch-coordinate-native-before.log').read_text()
after = (logs / 'watch-coordinate-native-after.log').read_text()
assert 'locator.click: Timeout 15000ms exceeded' in before
assert '"cases":1,"pageErrors":[],"liveProvider":false' in after
assert '"keyboardOpened":true,"changedLayouts":1' in after
assert 'a repeated question holds' in after
for check in ['lint', 'secrets', 'diff']:
    assert not (logs / f'watch-coordinate-{check}.log').read_text().strip(), check
assert 'ERROR:' not in (logs / 'watch-coordinate-duplication.log').read_text()
assert 'All matched files use Prettier' in (logs / 'watch-coordinate-format-check.log').read_text()
helper = 'js/tests/helpers/e2e-question-browser-watch.mjs'
names = [helper, 'js/tests/helpers/follow-disclosure.mjs',
         'js/tests/helpers/e2e-follow-disclosure.mjs',
         'experiments/issue-56/watch-disclosure-coordinate.mjs',
         'experiments/issue-56/watch-disclosure-coordinate-parent.py',
         'experiments/issue-56/parent_replay.py',
         'experiments/issue-56/collect-watch-disclosure-coordinate.py',
         'docs/case-studies/issue-56/ci-question-watch-disclosure.md',
         'ci-logs/8c22-webkit-2.log', 'ci-logs/8c22-webkit-2-job.json',
         'ci-logs/8c22-webkit-2-artifact/ms-e2e-question-watch-failed-webkit.png']
names += [str(p.relative_to(root)) for p in logs.glob('watch-coordinate-*.log')]
names += [str(p.relative_to(root)) for p in
          (root / 'docs/screenshots/issue-56-watch-coordinate').glob('*/*.png')]
names += ['experiments/issue-56/evidence_bundle.py']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries[f'before/{helper}'] = subprocess.check_output(
    ['git', 'show', f'8c2260b6:{helper}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent='8c2260b6', nativeCases=1,
    historicalLayoutCauseConfirmed=False, liveProvider=False,
    acceptance=False, hosted='pending'), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/watch-disclosure-coordinate.tar.gz', entries)
