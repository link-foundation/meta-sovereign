"""Run the small original-chat visibility checks with shared serial validation."""
from scoped_question_checks import verify_question_unit

focused = [f'js/tests/{name}.test.js' for name in (
    'browser-chat-reply-view', 'browser-conversation-tail',
    'browser-unread-conversations', 'question-unread-reply-view',
    'question-unread-notices')]
verify_question_unit('unread-reply-view', focused)
