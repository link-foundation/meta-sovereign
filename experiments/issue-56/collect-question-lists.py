"""Preserve bounded questionnaire learning reproduction and verification."""
from pathlib import Path
import hashlib
from evidence_bundle import bundle, changed_sources

root = Path(__file__).resolve().parents[2]
sources = changed_sources(root)
names = sorted(str(p.relative_to(root)) for p in
               (root / 'ci-logs').glob('question-lists-*.log')
               if p.name != 'question-lists-archive.log')
names += sorted(str(p.relative_to(root)) for p in
                (root / 'ci-logs').glob('question-lists-*.json'))
names += ['experiments/issue-56/collect-question-lists.py']
metadata = {
    'preceding_head': 'b7ff171bb2c64bf90ddcab7dafb40db9d7b6c250',
    'checks': {'before': '5 fail, 1 pass', 'focused': 53,
               'chromium': 'production questions flow passes'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'Shared stored-data controls verified. Live provider imports, wider forms/provider/device parity and exact new-head CI remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/question-lists.tar.gz'
bundle(root, names, archive, metadata, 'no-screenshots-for-this-archive')
