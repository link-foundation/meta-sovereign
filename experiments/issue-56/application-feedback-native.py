"""One finite native/MCP survey probe using shared bundle/resource cleanup."""
import sys
from application_native_probe import run_application_native

run_application_native(__file__, 'application-feedback', 'application-feedback',
    mcp='--mcp' in sys.argv, mcp_env={'APPLICATION_FEEDBACK_FIXTURE': '1'},
    native_entry='experiments/issue-56/application-feedback-browser.mjs')
