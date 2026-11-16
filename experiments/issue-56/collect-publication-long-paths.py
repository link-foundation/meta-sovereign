"""Preserve actual Windows failures and finite local path verification."""
import json
import hashlib
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = 'bf15f7213436046f5b2897d045067c49542792e5'
checks = {
    'publication-long-path-focused.log': ['ℹ pass 22', 'ℹ fail 0'],
    'publication-long-path-deno.log': ['8 passed', '0 failed'],
    'ci-bf15-windows-deno-133562828649.log': ['4 failed', "'uncertain'"],
    'ci-bf15-windows-node-133562828810.log': ['ℹ fail 4', "'uncertain'"],
    'ci-bf15-windows-bun-133562828672.log': ['4 fail', "'uncertain'"],
    'ci-9d31-windows-node-133576613964.log': ['ℹ fail 0', '✔ experience documents are reviewed'],
    'ci-9d31-windows-node2-133576614147.log': ['ℹ fail 0', '[publication-long-path]'],
    'ci-9d31-windows-deno1-133576614241.log': ['0 failed', '[publication-long-path]'],
    'ci-9d31-windows-bun-133576613983.log': ['0 fail', '[publication-long-path]'],
}
entries = {}
for name, fragments in checks.items():
    content = (logs / name).read_bytes()
    assert all(fragment in content.decode() for fragment in fragments), name
    entries[f'ci-logs/{name}'] = content
native = {}
for name in checks:
    if not name.startswith('ci-9d31-') or 'node-133576613964' in name:
        continue
    states = [json.loads(line.split('[publication-long-path] ', 1)[1])
              for line in (logs / name).read_text().splitlines()
              if '[publication-long-path] ' in line]
    assert len(states) == 2, name
    before, after = states
    assert all(r['platform'] == 'win32' and r['pathLength'] == 321
               and r['repositoryConfigUnchanged'] is True for r in states)
    assert before['legacy'] is True and before['filenameTooLong'] is True
    assert before['state'] == 'uncertain' and before['pushes'] == 0
    assert after['legacy'] is False and after['filenameTooLong'] is False
    assert after['state'] == 'published' and after['pushes'] == 1
    native[name] = states
for name in ['publication-long-path-lint.log', 'publication-long-path-format-check.log']:
    content = (logs / name).read_bytes()
    if 'lint' in name:
        assert not content.strip()
    else:
        assert b'All matched files use Prettier code style!' in content
    entries[f'ci-logs/{name}'] = content
duplication = (logs / 'publication-long-path-duplication.log').read_bytes()
assert b'ERROR:' not in duplication and b'(6.49%)' in duplication
entries['duplication.json'] = (json.dumps(dict(
    limitPercent=6.5, observedPercent=6.49,
    rawSha256=hashlib.sha256(duplication).hexdigest(),
)) + '\n').encode()
for name in [
    'js/src/jobs/cv-publication-git.js',
    'js/tests/cv-publication-long-paths.test.js',
    'js/tests/cv-publication-experience.test.js',
    'experiments/issue-56/publication-long-path-fixture.mjs',
    'experiments/issue-56/collect-publication-long-paths.py',
    'experiments/issue-56/cv-publication-fixture.mjs',
    'docs/case-studies/issue-56/ci-publication-long-paths.md',
]:
    entries[name] = (root / name).read_bytes()
for name in ['js/src/jobs/cv-publication-git.js', 'js/tests/cv-publication-experience.test.js']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
metadata = dict(
    parent=parent, hostedRun=43941245198,
    failedWindowsJobs=[133562828649, 133562828810, 133562828672],
    localNodeChecks=22, localDenoChecks=8,
    nativeWindowsRevision='9d31c3e71cd811371f91cbe0a33b193c5a518039',
    nativeWindowsRun=43944951085, nativeWindowsComparisons=native,
    nativeWindowsVerificationPending=False, liveProvider=False, acceptance=False,
)
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-publication-long-paths.tar.gz', entries)
