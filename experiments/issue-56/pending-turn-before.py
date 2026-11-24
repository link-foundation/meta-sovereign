"""Pinned production-source regression, restored before returning."""
from pathlib import Path
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2],
    'd4d04df2c3e6f3be9fc3bcc673430301747ef48e', 'pending-turn',
    'js/tests/browser-pending-turn.test.js',
    'browser review and native|earlier pending edit|legacy latest-only|malformed, incomplete',
    'experiments/issue-56/pending-turn-ui.mjs')
