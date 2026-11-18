"""Compose an independent MCP driver against the owned parent or current fixture."""
from pathlib import Path
import json
import sys

root = Path(__file__).resolve().parents[2]
before = '--before' in sys.argv
log = root / ('ci-logs/ui-defaults-before-mcp-server.log' if before else 'ci-logs/ui-defaults-mcp-server.log')
options = next(json.loads(row) for row in log.read_text().splitlines() if row.startswith('{"base":'))
options['before'] = before
driver = (root / 'experiments/issue-56/ui-defaults-mcp.mjs').read_text().strip().removesuffix(';')
print(f'async (page) => {{ const verify = {driver}; return verify(page, {json.dumps(options)}); }}')
