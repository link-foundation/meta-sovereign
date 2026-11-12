"""Verify only polling, its finite compatibility and the browser registry."""
from scoped_question_checks import verify_question_unit

focused = [f'js/tests/{name}.test.js' for name in (
    'question-unread-polling', 'question-unread-polling-controls',
    'question-browser-unread', 'question-unread-notices', 'question-unread-controls')]
verify_question_unit('unread-polling', focused)
