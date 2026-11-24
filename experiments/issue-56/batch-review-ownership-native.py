"""Verify the unchanged batch scenario against the corrected review ownership."""
import sys
from application_native_probe import run_application_native

run_application_native(__file__, 'batch-review-ownership', 'job-application-batch',
    mcp='--mcp' in sys.argv,
    mcp_env={'APPLICATION_BATCH_FIXTURE': '1', 'APPLICATION_DRAFT_FIXTURE': '1'},
    screenshots='docs/screenshots/batch-review-ownership-after')
