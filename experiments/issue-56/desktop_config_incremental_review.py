"""Check an explicitly reviewed source delta against its preserved baseline."""
import hashlib
import json
import subprocess


def changed_sources(previous, current):
    assert previous.keys() == current.keys(), 'archive selection changed'
    changed = {}
    for name, now in current.items():
        before = previous[name]
        assert {k: v for k, v in now.items() if k != 'sources'} == {
            k: v for k, v in before.items() if k != 'sources'}
        assert now['sources'].keys() == before['sources'].keys()
        for path, hashes in now['sources'].items():
            old = before['sources'][path]
            assert old['archived'] == hashes['archived'], path
            if old['current'] != hashes['current']:
                pair = dict(path=path, previous=old['current'], current=hashes['current'])
                assert path not in changed or changed[path] == pair
                changed[path] = pair
    return [changed[path] for path in sorted(changed)]


def check_incremental_review(root, audit, review, entries):
    carried = review['incrementalSourceReview']
    revision = carried['revision']
    assert len(revision) == 40 and all(c in '0123456789abcdef' for c in revision)
    baseline = f'ci-logs/desktop-configuration-criteria-{revision[:8]}'
    before = {}
    for suffix in ['source-audit.json', 'source-deltas.diff', 'source-review.json']:
        path = f'{baseline}-{suffix}'
        before[suffix] = (root / path).read_bytes()
        entries[path] = before[suffix]
    assert hashlib.sha256(before['source-review.json']).hexdigest() == carried['reviewSha256']
    old_review = json.loads(before['source-review.json'])
    assert old_review['revision'] == revision and old_review['acceptance'] is False
    assert 'unchangedSourceReview' not in old_review
    assert 'incrementalSourceReview' not in old_review
    assert hashlib.sha256(before['source-audit.json']).hexdigest() == old_review['auditSha256']
    assert hashlib.sha256(before['source-deltas.diff']).hexdigest() == old_review['diffSha256']
    old = json.loads(before['source-audit.json'])
    assert old['revision'] == revision and old['acceptance'] is False
    pairs = sorted({(path, hashes['archived'], hashes['current'])
        for archive in old['archives'].values()
        for path, hashes in archive['sources'].items() if hashes['changed']})
    assert old_review['pairs'] == [dict(path=p, archived=a, current=c) for p, a, c in pairs]
    assert old_review['reviewedChangedSourcePairs'] == len(pairs)
    assert old_review['reviewedChangedFiles'] == len({path for path, _, _ in pairs})
    changes = changed_sources(old['archives'], audit['archives'])
    assert changes and carried['reviewedSources'] == changes
    delta_path = 'ci-logs/desktop-configuration-criteria-incremental-source-deltas.diff'
    delta = (root / delta_path).read_bytes()
    assert hashlib.sha256(delta).hexdigest() == carried['diffSha256']
    actual = subprocess.check_output(['git', 'diff', '--no-ext-diff', '--no-renames',
        revision, audit['revision'], '--', *[change['path'] for change in changes]], cwd=root)
    assert delta == actual, 'incremental source comparison changed'
    entries[delta_path] = delta
    return changes
