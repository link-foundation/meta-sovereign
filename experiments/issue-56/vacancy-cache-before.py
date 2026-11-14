"""Reproduce rejected description puts on the actual published parent."""
from pathlib import Path
from parent_source_probe import verify_parent

root = Path(__file__).resolve().parents[2]
verify_parent(root, '222f2e80', 'vacancy-selection-cache',
              'js/tests/job-vacancy-cache-durability.test.js')
text = (root / 'ci-logs/vacancy-selection-cache-before-node.log').read_text()
assert 'fail 2' in text and 'pass 0' in text
assert 'A rejected collection must retain only acknowledged descriptions' in text
print('Both actual-parent cache regressions fail; current sources restored.')
