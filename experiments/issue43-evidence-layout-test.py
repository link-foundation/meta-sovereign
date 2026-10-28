"""Reproduce the actual PR layout exceeding GitHub's comparison API limit."""
import subprocess
import unittest


class EvidenceLayoutTest(unittest.TestCase):
    def test_complete_review_diff_fits_codeql_comparison_limit(self):
        # Include staged additions/removals so the archive conversion can be
        # verified before its commit. CodeQL refuses the comparison at >=300.
        names = subprocess.check_output(
            ['git', 'diff', '--name-only', '-z', 'origin/main'],
        ).split(b'\0')
        count = len([name for name in names if name])
        self.assertLess(count, 300, f'{count} changed files disable CodeQL diff analysis')


if __name__ == '__main__':
    unittest.main()
