"""Pinned production-source regression, restored before returning."""
from pathlib import Path
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2],
    '6dea5f91d16930e9e36935f58d238254961b0ed8', 'whole-turn',
    'js/tests/question-pending-plan.test.js',
    'model opt-out plans|later completed summaries|archived providers|browser inspection and manual',
    'experiments/issue-56/whole-turn-ui.mjs')
