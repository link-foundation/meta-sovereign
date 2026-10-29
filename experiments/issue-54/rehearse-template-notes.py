"""Reproduce changelog data loss in immutable JS/Python reference snapshots."""

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = ROOT / 'dev/log/issues/54/pulls/55/templates'
body = 'Example:\n\n```md\n## 9.9.9\n```\n\nRemaining details.'
content = f'## 1.2.3\n\n{body}\n\n## 1.2.2\nold'
js = next((TEMPLATES / 'js-ai-driven-development-pipeline-template/source').iterdir())
code = f'''import {{ extractReleaseNotes }} from {str((js / 'scripts/create-github-release.mjs').as_uri())!r};
console.log(JSON.stringify(extractReleaseNotes({content!r}, '1.2.3')));
'''
result = subprocess.check_output(['node', '--input-type=module', '-e', code], text=True)
expected_truncation = 'Example:\n\n```md'
assert json.loads(result) == expected_truncation, 'JS reference changed: recheck the upstream report'
print('JavaScript:', result.strip())
python = next((TEMPLATES / 'python-ai-driven-development-pipeline-template/source').iterdir())
spec = importlib.util.spec_from_file_location('release_fixture', python / 'scripts/create_github_release.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='issue54-notes-') as directory:
    path = Path(directory) / 'CHANGELOG.md'
    path.write_text(content)
    actual = module.extract_changelog_entry(path, '1.2.3')
    print(repr(actual))
    assert actual == expected_truncation, 'Python reference changed: recheck the upstream report'
print('JS/Python both truncate inside the fenced example; no network or publish used.')
example = '### Patch Changes\n\n- abcdef123: real change\n\n```md\n- deadbeef: example\n```'
code = f'''import {{ buildReleaseDescription }} from {str((js / 'scripts/format-release-notes-helpers.mjs').as_uri())!r};
console.log(JSON.stringify(buildReleaseDescription({example!r}).commitHashes));
'''
result = subprocess.check_output(['node', '--input-type=module', '-e', code], text=True)
assert json.loads(result) == ['abcdef123', 'deadbeef']
print('JavaScript also treats a fenced example as commit metadata:', result.strip())
