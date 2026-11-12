"""Verify borrowed visits with the shared sequential checker."""
from scoped_question_checks import verify_question_unit

focused = [
    'js/tests/browser-conversation-tail.test.js',
    'js/tests/browser-unread-conversations.test.js',
    'js/tests/browser-conversation-history.test.js',
]
verify_question_unit('unread-delivery-visit', focused)
