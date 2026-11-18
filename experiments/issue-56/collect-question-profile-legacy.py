"""Archive finite legacy-contact regressions, browser checks and source hashes."""
from pathlib import Path
import hashlib
import json
import subprocess
from evidence_bundle import write_hashed_archive

root = Path(__file__).resolve().parents[2]
changed = subprocess.check_output(
    ['git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
sources = sorted(set(name for name in changed if name and
                     not name.startswith('docs/case-studies/issue-56/data/')))
names = sorted(str(path.relative_to(root)) for path in
               (root / 'ci-logs').glob('legacy-profile-*')
               if path.is_file() and path.suffix in ['.log', '.json'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['ci-logs/question-concurrency-issue56.json',
          'experiments/issue-56/collect-question-profile-legacy.py']
assert 'fail 1' in (root / 'ci-logs/legacy-profile-before.log').read_text()
assert 'explicit source importer' in (root / 'ci-logs/legacy-profile-browser-before.log').read_text()
assert 'pass 73' in (root / 'ci-logs/legacy-profile-after.log').read_text()
assert '7 passed | 0 failed' in (root / 'ci-logs/legacy-profile-deno.log').read_text()
assert '[e2e-legacy-profile] OK (chromium)' in (root / 'ci-logs/legacy-profile-browser-after.log').read_text()
assert '[e2e-questions] OK (chromium)' in (root / 'ci-logs/legacy-profile-browser-integrated.log').read_text()
assert not (root / 'ci-logs/legacy-profile-lint.log').read_text()
assert json.loads((root / 'ci-logs/legacy-profile-mcp-after.log').read_text())['documentWidth'] == 390
metadata = {
    'preceding_head': '68328f693523e3aeeab83d2a6033e32d2abcaf55',
    'checks': {'before_core': 'fail', 'before_browser': 'fail',
               'node': 73, 'deno': 7, 'chromium': 'focused and existing questions flow pass',
               'mcp': 'selective staging, real syntax refusal, retry, explicit save/read, 390px'},
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                for name in sources},
    'limits': 'Legacy flat contacts import completes the inventoried QA05 mechanism. Broader issue criteria and exact new-head CI remain unfinished. The preceding chat overlap assertion is under investigation; Pages passes on the diagnostic head.',
}
archive = root / 'docs/case-studies/issue-56/data/question-profile-legacy.tar.gz'
write_hashed_archive(root, archive, names, metadata, len(sources))
