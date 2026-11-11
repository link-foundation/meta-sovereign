"""Preserve bounded owner correction reproduction and verification."""
from pathlib import Path
import hashlib
from evidence_bundle import bundle, changed_sources

root = Path(__file__).resolve().parents[2]
sources = changed_sources(root)
names = sorted(str(p.relative_to(root)) for p in
               (root / 'ci-logs').glob('question-corrections-*.log')
               if p.name != 'question-corrections-archive.log')
names += sorted(str(p.relative_to(root)) for p in
                (root / 'ci-logs').glob('question-corrections-*.json'))
names += ['ci-logs/question-cleanup-reference-learning.json',
          'ci-logs/question-cleanup-reference-learning.mjs']
names += ['experiments/issue-56/collect-question-corrections.py']
metadata = {
    'preceding_head': 'dfa1f68d8b0888ba4468fd6e3fc354bcff216bf6',
    'checks': {'before': '5 fail, 1 pass; private-path case also fails before its fix', 'focused': 47,
               'chromium': 'production questions flow passes'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'Explicit owner-policy correction and private-path controls verified. General fact extraction, concurrent knowledge edits, live imports, Windows/Deno EBUSY and other unchecked issue scope remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/question-corrections.tar.gz'
bundle(root, names, archive, metadata, 'no-screenshots-for-this-archive')
