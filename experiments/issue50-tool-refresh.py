"""Refresh official tool/action release metadata, with four concurrent requests."""
import concurrent.futures
import json
from pathlib import Path
import subprocess
from urllib.request import urlopen

OUT = Path(__file__).resolve().parents[1] / 'dev/log/issues/50/pulls/51/research'
previous = json.loads((OUT / 'action-releases.json').read_text())
repos = list(previous) + ['actions/setup-python', 'oven-sh/bun', 'denoland/deno', 'swiftlang/swift',
                          'swiftlang/swiftly', 'rhysd/actionlint',
                          'koalaman/shellcheck', 'lycheeverse/lychee']


def release(repo):
    if repo == 'github/codeql-action':
        pages = json.loads(subprocess.check_output([
            'gh', 'api', '--paginate', '--slurp', f'repos/{repo}/releases?per_page=100',
        ]))
        # The repository's "latest" release is a bundle, not the action.
        value = next(value for page in pages for value in page
                     if value['tag_name'].startswith('v4.')
                     and not value['prerelease'] and not value['draft'])
        return repo, value
    value = json.loads(subprocess.check_output([
        'gh', 'api', f'repos/{repo}/releases/latest',
    ]))
    return repo, value


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = dict(pool.map(release, repos))
(OUT / 'tool-action-refresh.json').write_text(json.dumps(results, indent=2) + '\n')
for repo, value in results.items():
    old = previous.get(repo, {}).get('tag_name')
    print(repo, value['tag_name'], f'previous={old}' if old else '')

stable_sha = subprocess.check_output([
    'gh', 'api', 'repos/dtolnay/rust-toolchain/commits/stable', '--jq', '.sha',
], text=True).strip()
(OUT / 'rust-toolchain-stable-refresh.txt').write_text(stable_sha + '\n')
print('rust-toolchain stable', stable_sha)

for name, url in {
    'pip': 'https://pypi.org/pypi/pip/json',
    'zizmor': 'https://pypi.org/pypi/zizmor/json',
    'cargo-audit': 'https://crates.io/api/v1/crates/cargo-audit',
    'rust-stable': 'https://static.rust-lang.org/dist/channel-rust-stable.toml',
}.items():
    with urlopen(url) as response:
        data = response.read()
    extension = 'toml' if name == 'rust-stable' else 'json'
    (OUT / f'{name}-refresh.{extension}').write_bytes(data)
    if extension == 'json':
        metadata = json.loads(data)
        version = (metadata['crate']['max_stable_version'] if name == 'cargo-audit'
                   else metadata['info']['version'])
        print(name, version)
