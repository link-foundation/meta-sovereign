"""Index emitted CI diagnostics and verify retained browser artifact contents.

Usage: python experiments/issue43-review-ci.py RUN_ID [RUN_ID ...]
This reads evidence only; it never executes downloaded code or treats an
unclassified diagnostic or a historical failing browser summary as a pass.
"""
import argparse
import json
import re
import zipfile
from pathlib import Path

DEST = Path(__file__).resolve().parents[1] / 'dev/log/issues/43/pulls/44'
SIGNAL = re.compile(r'::warning::|::error::|\bwarning:|\bWarning:|npm [wW][aA][rR][nN]|DeprecationWarning|ExperimentalWarning|DEPRECATED|Browser checks failed|✗')


def review(run_id):
    source = DEST / f'ci-logs/workflow-{run_id}.log'
    hits = []
    with source.open() as log:
        for number, line in enumerate(log, 1):
            if not SIGNAL.search(line):
                continue
            if '"title" : "DEPRECATED' in line or '"description" : "DEPRECATED' in line:
                category = 'CodeQL schema describes unused deprecated options'
            elif any(token in line for token in ('echo "::warning::', "echo '::warning::", 'echo "::error::', "echo '::error::", "printf '::error::")):
                category = 'echoed command source; inspect whether executed separately'
            else:
                category = 'REVIEW'
            hits.append({'line': number, 'category': category, 'text': line.rstrip()})
    target = DEST / f'research/diagnostic-review-{run_id}.json'
    target.write_text(json.dumps({'source': str(source.relative_to(DEST)), 'hits': hits}, indent=2) + '\n')
    print(f'{run_id}: {len(hits)} diagnostic matches; {sum(hit["category"] == "REVIEW" for hit in hits)} require review')


def artifacts():
    rows = []
    for path in sorted((DEST / 'artifacts').glob('*.zip')):
        with zipfile.ZipFile(path) as archive:
            assert archive.testzip() is None, path
            summaries = []
            for name in archive.namelist():
                if name.endswith('summary.json'):
                    summary = json.loads(archive.read(name))
                    summaries.append({'path': name, 'summary': summary})
            rows.append({'artifact': path.name, 'crc': 'pass', 'summaries': summaries})
    (DEST / 'research/artifact-content-verification.json').write_text(json.dumps(rows, indent=2) + '\n')
    print(f'{len(rows)} ZIP CRC checks pass; historical summary failures remain recorded')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run_id', nargs='*', type=int)
    for run in parser.parse_args().run_id:
        review(run)
    artifacts()
