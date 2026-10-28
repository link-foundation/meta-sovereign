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
    run = json.loads((DEST / f'github/run-{run_id}.json').read_text())
    checks = json.loads((DEST / f'github/commit-{run["head_sha"]}-check-runs.json').read_text())
    annotations = []
    for check in checks:
        if not check.get('output', {}).get('annotations_count'):
            continue
        pages = json.loads((DEST / f'github/annotations/{check["id"]}.json').read_text())
        for page in pages:
            annotations.extend(dict(row, check_id=check['id'], check_name=check['name']) for row in page)
    warnings = [row for row in annotations if row['annotation_level'] in ('warning', 'failure')]
    report = {'source': str(source.relative_to(DEST)), 'hits': hits,
              'annotations': annotations, 'warning_or_failure_annotations': warnings}
    target.write_text(json.dumps(report, indent=2) + '\n')
    print(f'{run_id}: {len(hits)} diagnostic matches; {sum(hit["category"] == "REVIEW" for hit in hits)} require review; {len(warnings)} warning/failure check annotations')
    return report


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
    parser.add_argument('--strict', action='store_true', help='Fail on warning/failure annotations or unclassified diagnostic text')
    args = parser.parse_args()
    reports = [review(run) for run in args.run_id]
    artifacts()
    if args.strict and any(report['warning_or_failure_annotations'] or any(hit['category'] == 'REVIEW' for hit in report['hits']) for report in reports):
        raise SystemExit('CI diagnostics require investigation; review saved reports')
