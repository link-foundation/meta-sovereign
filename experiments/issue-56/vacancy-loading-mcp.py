"""Reuse the existing independent MCP cache inspection on the delayed fixture.

MCP reads a self-contained function file, so preserve the reused invocation with
only its screenshot destination changed. Provider/cache assertions stay exact.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = (root / 'experiments/issue-56/vacancy-metadata-mcp.mjs').read_text()
old = '/docs/screenshots/issue-56-vacancy-metadata/after'
assert source.count(old) == 1
literal = next(line.strip().removesuffix(';') for line in source.splitlines() if old in line)
source = source.replace(literal,
    repr(str(root / 'docs/screenshots/issue-56-vacancy-loading')))
(root / 'ci-logs/vacancy-loading-mcp-code.mjs').write_text(source.rstrip().removesuffix(';'))
