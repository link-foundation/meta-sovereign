"""Finite collector regressions against actual four/eight-shard Git sources."""
import json
from pathlib import Path
import subprocess
from hosted_browser_layout import read_browser_layout

root = Path(__file__).resolve().parents[2]


def read(revision, path):
    return subprocess.check_output(['git', 'show', f'{revision}:{path}'], cwd=root).decode()


for revision, count, entries in [('b3364503', 4, 155), ('3bbb9ee2', 8, 156)]:
    source = lambda path: read(revision, path)
    registry, actual = read_browser_layout(source)
    assert actual == count and len(registry) == entries
    groups = ['vk-token', 'desktop-appearance', 'vk-engagement', 'vk-friends', 'vk-configured']
    for group in groups:
        shard = registry.index(group) % actual + 1
        assert group in registry[shard - 1::actual]
        assert sum(group in registry[index::actual] for index in range(actual)) == 1
    print(f'{revision}: {actual} source-bound shards, {entries} registrations, all five groups once')

source = {path: read('3bbb9ee2', path) for path in [
    '.github/workflows/release.yml', 'js/scripts/browser-checks.json']}
workflow = source['.github/workflows/release.yml']
registry = json.loads(source['js/scripts/browser-checks.json'])
variants = {
    'duplicate registration': {'js/scripts/browser-checks.json': json.dumps(registry + registry[:1])},
    'missing partition': {'.github/workflows/release.yml': workflow.replace(
        'shard: [1, 2, 3, 4, 5, 6, 7, 8]', 'shard: [1, 2, 3, 4, 5, 6, 7]')},
    'contradictory native count': {'.github/workflows/release.yml': workflow.replace(
        'E2E_SHARD: ${{ matrix.shard }}/8', 'E2E_SHARD: ${{ matrix.shard }}/4')},
    'contradictory hosted name': {'.github/workflows/release.yml': workflow.replace(
        'shard ${{ matrix.shard }}/8)', 'shard ${{ matrix.shard }}/4)')},
    'missing engine': {'.github/workflows/release.yml': workflow.replace(
        'browser: [chromium, webkit]', 'browser: [chromium]')},
}
for name, replacement in variants.items():
    candidate = {**source, **replacement}
    try:
        read_browser_layout(candidate.__getitem__)
    except AssertionError:
        print(f'{name}: refused')
    else:
        raise AssertionError(f'{name}: silently accepted contradictory source')
print('PASS: two actual Git layouts and five contradictory-source refusals; no local matrix')
