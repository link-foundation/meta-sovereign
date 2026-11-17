"""Validate bounded prior artifact metadata and preserve native-check sources."""
import json
from pathlib import Path
import re
import runpy

root = Path(__file__).resolve().parents[2]
evidence = runpy.run_path(str(root / 'experiments/issue-56/evidence_bundle.py'))
_, logs, read = evidence['evidence_context'](__file__, 'desktop-criterion')
directory = logs / 'desktop-criterion-549-metadata'
artifacts = json.loads((directory / 'summary.json').read_text())
jobs = json.loads((logs / 'desktop-criterion-549-jobs.json').read_text())
merge = json.loads((logs / 'desktop-criterion-549-merge.json').read_text())
head = '549635f23bbaec203157edbf2bc874529426ea60'
assert jobs['headSha'] == head and jobs['conclusion'] == 'success'
assert merge['parents'][1] == head and merge['tree'] == merge['headTree']
assert len(artifacts) == 5 and sum(a['fetchedBytes'] for a in artifacts) == 5559
records = 0
for artifact in artifacts:
    platform = artifact['name'].removeprefix('desktop-')
    lines = (directory / f'SHA256SUMS-{platform}.txt').read_text().splitlines()
    # sha256sum uses a space for text mode and an asterisk for binary mode.
    matches = [re.fullmatch(r'([a-f0-9]{64}) [ *](.+)', line) for line in lines]
    assert matches and all(matches), platform
    filenames = [match[2] for match in matches]
    expected = {entry['name'] for entry in artifact['files']
                if entry['name'].endswith(('.dmg', '.zip', '.exe', '.deb', '.AppImage', '.tar.gz'))}
    assert len(filenames) == len(set(filenames)) and set(filenames) == expected, platform
    provenance = (directory / f'provenance-{platform}.txt').read_text()
    assert f'commit: {merge["commit"]}' in provenance
    assert all(filename in provenance for filename in filenames)
    records += len(filenames)
assert records == 14
for suffix in ['', '.ru', '.hi', '.zh']:
    guide = (root / f'docs/USER-GUIDE{suffix}.md').read_text()
    for command in ['npm ci && npm run build:web && npm run desktop:build',
                    'shasum -a 256', 'Get-FileHash -Algorithm SHA256',
                    'BUILD-PROVENANCE.txt']:
        assert command in guide, (suffix, command)
    assert 'npm i --no-save electron-builder@^26' not in guide
evidence['verify_evidence'](read, {
    'focused': ['pass 24', 'fail 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
}, empty=('lint', 'secrets', 'diff'))
metadata = {
    'previousHead': head, 'previousDesktopRun': 44035649627,
    'merge': merge, 'metadataBytesFetched': 5559, 'checksumRecords': records,
    'independentlyHashedInstallerBytes': False,
    'currentNativeChecks': 'pending hosted CI on the new source',
    'acceptance': False, 'fullIssueComplete': False,
}
(logs / 'desktop-criterion-metadata-validation.log').write_text(
    json.dumps(metadata, indent=2) + '\n')
names = evidence['changed_sources'](root)
names += evidence['evidence_logs'](root, 'desktop-criterion')
names += [str(path.relative_to(root)) for path in directory.iterdir() if path.is_file()]
evidence['write_hashed_archive'](root,
    root / 'docs/case-studies/issue-56/data/desktop-installation-verification.tar.gz',
    names, metadata, len(evidence['changed_sources'](root)))
