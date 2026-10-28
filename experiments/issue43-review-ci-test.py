"""Check that successful Actions logs cannot conceal warning annotations."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('review_ci', Path(__file__).with_name('issue43-review-ci.py'))
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class AnnotationReviewTest(unittest.TestCase):
    def test_successful_log_still_reports_external_check_warning(self):
        with tempfile.TemporaryDirectory(prefix='issue43-review-') as temp:
            dest = Path(temp)
            files = {
                'ci-logs/workflow-17.log': 'A successful workflow with no warning text\n',
                'github/run-17.json': json.dumps({'head_sha': 'fixture-sha'}),
                'github/commit-fixture-sha-check-runs.json': json.dumps([
                    {'id': 42, 'name': 'CodeQL', 'conclusion': 'success',
                     'output': {'annotations_count': 1}},
                ]),
                'github/annotations/42.json': json.dumps([[{
                    'annotation_level': 'warning', 'title': '',
                    'message': 'Cannot retrieve the full diff',
                }]]),
            }
            for name, data in files.items():
                path = dest / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(data)
            (dest / 'research').mkdir()
            with patch.object(review, 'DEST', dest):
                review.review(17)
            report = json.loads((dest / 'research/diagnostic-review-17.json').read_text())
            self.assertEqual(report['hits'], [])
            self.assertEqual(report['warning_or_failure_annotations'][0]['message'],
                             'Cannot retrieve the full diff')
            self.assertEqual(report['warning_or_failure_annotations'][0]['check_name'], 'CodeQL')


if __name__ == '__main__':
    unittest.main()
