"""Focused offline regression for standalone code-scanning evidence collection."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('issue43_runs', Path(__file__).with_name('issue43-runs.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class CommitChecksTest(unittest.TestCase):
    def test_pending_workflow_still_preserves_standalone_check_and_all_annotations(self):
        run = {'id': 17, 'head_sha': 'fixture-sha', 'status': 'in_progress'}
        service = {'id': 42, 'name': 'CodeQL', 'conclusion': 'failure', 'output': {'annotations_count': 2}}
        responses = {
            f'repos/{collector.REPO}/actions/runs?branch=issue-43-1924384484c0&per_page=100': [{'workflow_runs': [run]}],
            f'repos/{collector.REPO}/actions/runs/17/jobs?per_page=100': [{'jobs': []}],
            f'repos/{collector.REPO}/actions/runs/17/artifacts?per_page=100': [{'artifacts': []}],
            f'repos/{collector.REPO}/commits/fixture-sha/check-runs?filter=all&per_page=100': [{'check_runs': [service]}, {'check_runs': []}],
            f'repos/{collector.REPO}/commits/fixture-sha/statuses?per_page=100': [[]],
            f'repos/{collector.REPO}/check-runs/42/annotations?per_page=100': [[{'message': 'first'}], [{'message': 'second'}]],
        }
        with tempfile.TemporaryDirectory(prefix='issue43-checks-') as temp:
            dest = Path(temp)
            with patch.object(collector, 'DEST', dest), patch.object(collector, 'api', side_effect=lambda endpoint: responses[endpoint]), patch.object(collector, 'gh', return_value=json.dumps(run).encode()), patch.object(collector, 'collect_diagnostic_artifacts'), patch.object(sys, 'argv', ['collector', '--run-id', '17']):
                collector.main()
            checks = json.loads((dest / 'github/commit-fixture-sha-check-runs.json').read_text())
            self.assertEqual(checks, [service])
            self.assertEqual(json.loads((dest / 'github/commit-fixture-sha-statuses.json').read_text()), [[]])
            annotations = json.loads((dest / 'github/annotations/42.json').read_text())
            self.assertEqual([a['message'] for page in annotations for a in page], ['first', 'second'])


if __name__ == '__main__':
    unittest.main()
