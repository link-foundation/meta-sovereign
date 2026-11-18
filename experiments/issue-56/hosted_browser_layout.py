"""Read the mandatory browser partition from the selected source, fail closed."""
import json
import re


def read_browser_layout(source):
    workflow = source('.github/workflows/release.yml')
    blocks = re.findall(r'(?ms)^  e2e-browser:\n(.*?)(?=^  [\w-]+:|\Z)', workflow)
    assert len(blocks) == 1, 'require one mandatory browser job'
    block = blocks[0]
    counts = re.findall(r'^      E2E_SHARD: \$\{\{ matrix.shard \}\}/([1-9]\d*)$',
                        block, re.M)
    assert len(counts) == 1, 'require the explicit native shard count'
    count = int(counts[0])
    assert count <= 64, 'refuse an unbounded partition'
    assert re.findall(r'^        browser: \[([^\]]+)\]$', block, re.M) == [
        'chromium, webkit'], 'require both native engines'
    matrices = re.findall(r'^        shard: \[([\d, ]+)\]$', block, re.M)
    assert len(matrices) == 1
    assert [int(value) for value in matrices[0].split(',')] == list(range(1, count + 1)), (
        'require every shard exactly once')
    assert f'name: Browser e2e (${{{{ matrix.browser }}}}, shard ${{{{ matrix.shard }}}}/{count})' in block
    registry = json.loads(source('js/scripts/browser-checks.json'))
    assert isinstance(registry, list) and registry and len(registry) <= 4096
    assert all(isinstance(name, str) and re.fullmatch(r'[a-z][a-z0-9-]*', name)
               for name in registry), 'require literal registered group names'
    assert len(set(registry)) == len(registry), 'duplicate browser registration'
    return registry, count
