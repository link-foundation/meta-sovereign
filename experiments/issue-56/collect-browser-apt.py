"""Preserve repeated hosted package-download timeouts and focused evidence."""
from pathlib import Path
from evidence_bundle import write_entries_archive
import hashlib
import json

root = Path(__file__).resolve().parents[2]
names = sorted(str(path.relative_to(root)) for path in
               (root / 'ci-logs').glob('browser-apt-*')
               if path.is_file() and path.suffix in ['.log', '.json'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['ci-logs/hh-history-pages-42812224902.log',
          'ci-logs/hh-history-pages-jobs.json',
          'ci-logs/shared-profile-pages-42804967429.log',
          'experiments/issue-56/collect-browser-apt.py',
          'ci-logs/hh-common-pages-42816515218.log',
          'ci-logs/hh-common-current-runs.json',
          'ci-logs/browser-apt-mirrorlist-reference.sh']
assert 'prepare before apt' in (root / 'ci-logs/browser-apt-before.log').read_text()
assert 'pass 23' in (root / 'ci-logs/browser-apt-after.log').read_text()
assert not (root / 'ci-logs/browser-apt-lint.log').read_text()
assert 'fail 1' in (root / 'ci-logs/browser-apt-mirrorlist-before.log').read_text()
assert 'pass 25' in (root / 'ci-logs/browser-apt-mirrorlist-after.log').read_text()
assert not (root / 'ci-logs/browser-apt-mirrorlist-lint.log').read_text()
sources = ['docs/case-studies/issue-56/ci-browser-apt.md',
           'experiments/issue-56/collect-browser-apt.py',
           'js/scripts/prepare-browser-apt.mjs', 'js/tests/ci-browser-apt.test.js']
hosted = (root / 'ci-logs/browser-apt-mirrorlist-pages-42822720570.log').read_text()
assert 'Browser APT sources updated: 1' in hosted
assert 'https://archive.ubuntu.com/ubuntu' in hosted
metadata = {
    'preceding_head': '364463ec039dbcc20d1f30fe6da1fbbd050f06e6',
    'references': ['https://ubuntu.com/project/docs/how-ubuntu-is-made/concepts/package-archive/',
                   'https://playwright.dev/docs/ci',
                   'https://github.com/actions/runner-images/blob/741e4eb8ef5f51698d730ac16ede65cadb067522/images/ubuntu/scripts/build/configure-apt-sources.sh',
                   'https://manpages.debian.org/unstable/apt/apt-transport-mirror.1.en.html'],
    'checked': '2026-11-10',
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                for name in sources},
    'checks': {'before': 'workflow regression fails', 'focused': 23,
               'lint': 'pass', 'workflow_policy': 'pass',
               'hosted_mirrorlist_before': 'fails: zero updated files',
               'hosted_mirrorlist_after': 25},
    'hosted_e280197a': 'All workflows pass; Pages line 245 updates zero sources and line 258 reads unhandled apt-mirrors.txt. Healthy transfers are not proof of the original helper.',
    'hosted_4ed3f9c58': 'Pages 42822720570 passes: one changed source at line 246, primary HTTPS indexes 263-266 and actual package transfers from 460; 139 MB in 37 seconds at 645.',
    'limits': 'Synthetic local APT fixtures and exact 4ed3f9c58 hosted verification. Later current-head browser assertions remain required; no timeout increase.',
}
archive = root / 'docs/case-studies/issue-56/data/browser-apt.tar.gz'
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
write_entries_archive(archive, entries, len(sources))
