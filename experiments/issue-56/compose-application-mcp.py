"""Print portable MCP code with the shared owned-browser fixture in lexical scope."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parent
driver = (root / sys.argv[1]).read_text().strip().removesuffix(';')
fixture = (root / 'application-mcp-fixture.mjs').read_text().strip().removesuffix(';')
print(f'async (page) => {{ const fixture = {fixture}; const verify = {driver}; return verify(page, fixture); }}')
