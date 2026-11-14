"""Validate the specific expected parent failure across negotiated schema versions."""
import re


def check_parent_failure(result, *, sync):
    assert result.returncode != 0, result.stdout
    if sync:
        assert re.search(
            r'native CLI did not reconcile (?:schema-\d+|current-schema) JavaScript peer',
            result.stdout), result.stdout
    else:
        assert 'acknowledged owner write survives process termination' in result.stdout, result.stdout
        assert '404 !== 200' in result.stdout, result.stdout
