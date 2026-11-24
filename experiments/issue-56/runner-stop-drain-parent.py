"""Run the new finite Stop regressions against the exact published parent."""
from pathlib import Path
from parent_source_probe import verify_parent

root = Path(__file__).resolve().parents[2]
verify_parent(root, '4bb612207b6cc2673862a6f5a196d13775096a6b',
              'runner-stop-drain', 'js/tests/runner-stop-drain.test.js')
