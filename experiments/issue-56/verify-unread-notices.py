"""Verify the finite notice unit with the shared sequential checker."""
from scoped_question_checks import verify_question_unit

focused = [f'js/tests/{name}.test.js' for name in [
    'question-unread-notices', 'question-unread-notice-controls',
    'question-browser-unread', 'question-unread-controls',
    'question-notice-watch', 'question-browser-watch-controls']]
verify_question_unit('unread-notice', focused)
