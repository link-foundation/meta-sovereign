"""Keep the finite state regressions after production items for strict Clippy."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
path = root / 'rust/crates/meta-sovereign-server/src/state.rs'
source = path.read_text()
marker = '// Native rich-record admission regressions.'
before, rest = source.split(marker, 1)
if 'pub struct ServerState' in rest:
    cases, production = rest.split('pub struct ServerState', 1)
    path.write_text(before + 'pub struct ServerState' + production + '\n' + marker + cases)
