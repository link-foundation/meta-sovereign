"""Preserve documentation review without claiming a macOS runtime test."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = 'b61cf5fd504e8e928eec5e4ed869087f869dd395'
names = [f'{stem}{language}.md' for stem in ['README', 'docs/USER-GUIDE']
         for language in ['', '.ru', '.hi', '.zh']]
entries = {name: (root / name).read_bytes() for name in names}
for name in names:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
for name in [
    'js/src/web/download/model.js', 'js/src/web/download/copy.js',
    'docs/case-studies/issue-56/macos-first-launch.md',
    'docs/case-studies/issue-56/macos-first-launch-plan.md',
    'experiments/issue-56/collect-macos-first-launch.py',
    'experiments/issue-56/evidence_bundle.py',
    'ci-logs/macos-first-launch-format-check.log',
    'ci-logs/macos-first-launch-diff.log',
]:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'criterion': 'VD09', 'acceptance': False,
    'documentationOnly': True, 'macOSRuntimeExercised': False,
    'primarySource': 'https://support.apple.com/en-us/102445',
    'sourceReviewed': '2026-11-16', 'sourcePublished': '2026-05-27',
    'locales': ['en', 'ru', 'hi', 'zh'],
}, indent=2) + '\n').encode()
write_entries_archive(
    root / 'docs/case-studies/issue-56/data/macos-first-launch.tar.gz', entries)
