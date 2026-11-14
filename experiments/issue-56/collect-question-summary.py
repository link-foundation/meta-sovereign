"""Preserve bounded summary learning reproduction and verification."""
from pathlib import Path
import hashlib
from evidence_bundle import bundle, changed_sources

root = Path(__file__).resolve().parents[2]
sources = changed_sources(root)
names = sorted(str(p.relative_to(root)) for p in
               (root / 'ci-logs').glob('question-summary-*.log')
               if p.name != 'question-summary-archive.log')
names += sorted(str(p.relative_to(root)) for p in
                (root / 'ci-logs').glob('question-summary-*.json'))
names += ['experiments/issue-56/collect-question-summary.py']
metadata = {
    'preceding_head': '86eebd79e4575e003471a0b03dd2d9f8153030e9',
    'checks': {'before': '6 fail', 'focused': 42,
               'chromium': 'production questions flow passes'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'Shared stored-data controls verified. Live provider imports, wider forms/provider/device parity and exact new-head CI remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/question-summary.tar.gz'
bundle(root, names, archive, metadata, 'no-screenshots-for-this-archive')
