"""Verify archived implementation bytes and record their current source hashes.

This finite audit establishes integrity and source changes, not acceptance.
Hosted run receipts and the original behavior mapping require separate review.
It streams archives without extracting files or running local test matrices.
"""
import difflib
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile

root = Path(__file__).resolve().parents[2]
data = root / 'docs/case-studies/issue-56/data'
revision = subprocess.check_output(
    ['git', 'rev-parse', sys.argv[1] if len(sys.argv) > 1 else 'HEAD'],
    cwd=root).decode().strip()
names = [
    'vk-friend-stats', 'vk-friend-priority', 'runner-log',
    'vk-message-defaults', 'vk-cache', 'vk-stickers', 'vk-discovery',
    'vk-queue', 'vk-trigger', 'vk-live-history', 'vk-queue-lifecycle',
    'vk-token', 'vk-token-registration', 'vk-token-electron-entry',
    'runner-feedback',
    'live-diagnostics', 'desktop-clipboard', 'desktop-clipboard-async',
    'question-lists', 'question-assembly-context', 'questionnaire-index',
    'forms-questionnaire-learning', 'application-answer-context',
    'application-answer-approval',
    'question-turns', 'question-policy', 'question-corrections',
    'question-concurrency',
    'cv-publication', 'cv-publication-consent', 'cv-publication-exports',
    'experience-publication', 'ci-publication-long-paths',
    'ci-publication-panels',
]
audits = {}
hashed_revisions = {
    'question-lists': '86eebd79',
    'question-corrections': '2aced5d3',
    'question-concurrency': 'ed241ef5',
}
# These two early archives retain regressions but no production source hashes.
# Compare their published implementations separately; do not imply that these
# bytes were present in, or cryptographically bound by, the old archives.
git_sources = {
    'question-turns': ('df7c0c28', [
        'question-answers', 'question-learning', 'question-turns']),
    'question-policy': ('01f4d6c8', [
        'question-answers', 'question-learning', 'question-policy',
        'question-store']),
}


def compare_source(name, source, content, delta):
    current = subprocess.check_output(
        ['git', 'show', f'{revision}:{source}'], cwd=root)
    if content != current:
        delta.writelines(difflib.unified_diff(
            content.decode().splitlines(True), current.decode().splitlines(True),
            fromfile=f'{name}/{source}', tofile=f'{revision}/{source}'))
    return {
        'archived': hashlib.sha256(content).hexdigest(),
        'current': hashlib.sha256(current).hexdigest(),
        'changed': content != current,
    }


with (root / 'ci-logs/hosted-criteria-source-deltas.diff').open('w') as delta:
    for name in names:
        archive = data / f'{name}.tar.gz'
        manifest = archive.with_suffix('').with_suffix('.tar.sha256.json')
        expected = json.loads(manifest.read_text())['files']
        actual = {}
        sources = {}
        with tarfile.open(archive, 'r:gz') as tar:
            for entry in tar:
                if not entry.isfile():
                    continue
                assert entry.name not in actual, f'duplicate entry: {entry.name}'
                content = tar.extractfile(entry).read()
                actual[entry.name] = hashlib.sha256(content).hexdigest()
                source = entry.name.startswith(('js/src/', 'js/electron/')) or entry.name == 'experiments/issue-56/vk-token-electron.mjs'
                if not source or entry.name.endswith('/app.min.js'):
                    continue
                sources[entry.name] = compare_source(name, entry.name, content, delta)
        assert actual == expected, f'archive integrity failure: {name}'
        if name in hashed_revisions:
            with tarfile.open(archive, 'r:gz') as tar:
                declared = json.load(tar.extractfile('metadata.json'))['sources']
            for source in declared:
                if not source.startswith('js/src/') or source.endswith('/app.min.js'):
                    continue
                content = subprocess.check_output(
                    ['git', 'show', f'{hashed_revisions[name]}:{source}'], cwd=root)
                assert hashlib.sha256(content).hexdigest() == declared[source], source
                sources[source] = compare_source(name, source, content, delta)
        provenance = None
        if name in git_sources:
            implementation, stems = git_sources[name]
            implementation = subprocess.check_output(
                ['git', 'rev-parse', implementation], cwd=root).decode().strip()
            provenance = dict(revision=implementation, archiveSourceHashes=False)
            for stem in stems:
                source = f'js/src/automation/{stem}.js'
                content = subprocess.check_output(
                    ['git', 'show', f'{implementation}:{source}'], cwd=root)
                sources[source] = compare_source(name, source, content, delta)
        audits[name] = {
            'entries': len(actual), 'sources': sources,
            'gitSourceProvenance': provenance,
            'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
            'manifestSha256': hashlib.sha256(manifest.read_bytes()).hexdigest(),
        }
        print(f'{name}: {len(actual)} verified entries, '
              f'{sum(source["changed"] for source in sources.values())} changed sources')
output = {'revision': revision, 'acceptance': False, 'archives': audits}
(root / 'ci-logs/hosted-criteria-source-audit.json').write_text(
    json.dumps(output, indent=2) + '\n')
print(f'All {len(audits)} archives verified without extraction; acceptance remains separate')
