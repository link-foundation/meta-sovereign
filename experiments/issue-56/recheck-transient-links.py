"""Recheck only the finite source URLs from the preserved hosted 503 failure."""
import argparse
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('binary', type=Path)
args = parser.parse_args()
log = (ROOT / 'ci-logs/2769b823-links-failed.log').read_text()
urls = sorted(set(re.findall(r'\[503\] <(https://github\.com/[^>]+)>', log)))
assert len(urls) == 11, len(urls)
links = ROOT / 'ci-logs/lychee-transient-urls.md'
links.write_text('\n'.join(f'<{url}>' for url in urls) + '\n')
(ROOT / 'ci-logs/lychee-transient-urls.json').write_text(json.dumps(urls, indent=2) + '\n')
result = subprocess.run([
    str(args.binary.resolve()), '--config', 'lychee.toml', '--verbose',
    '--no-progress', '--max-concurrency', '4', '--max-retries', '3',
    '--retry-wait-time', '2', '--timeout', '30', str(links),
], cwd=ROOT)
raise SystemExit(result.returncode)
