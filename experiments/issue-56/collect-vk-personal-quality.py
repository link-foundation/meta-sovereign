"""Check receipt compatibility, strict contribution gates and translated guides."""
from evidence_bundle import evidence_context, changed_sources, evidence_logs, parent_reply_sources, bundle

root, logs, read = evidence_context(__file__, 'vk-proactive-quality')
for name, fragments in {
    'before-node': ['fail 1', "actual: 'reviewed-message'", "expected: 'greeting-and-question'"],
    'node': ['pass 70', 'fail 0'],
    'deno': ['28 passed | 0 failed'],
    'format': ['All matched files use Prettier code style!'],
}.items():
    assert all(text in read(name) for text in fragments), name
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
assert 'ERROR:' not in read('duplication')
for language in ['', '.ru', '.hi', '.zh']:
    page = (root / f'docs/VK-FRIEND-GREETINGS{language}.md').read_text()
    for command in ['vk-greet status', 'vk-greet save', 'vk-greet plan', 'vk-greet run']:
        assert command in page
work = changed_sources(root)
parent = '29b14f72'
bundle(root, work + evidence_logs(root, 'vk-proactive-quality'),
       'docs/case-studies/issue-56/data/vk-personal-quality.tar.gz', {
           'parent': parent, 'parent_failed_assertions': 1,
           'node_focused_checks': 70, 'deno_focused_checks': 28,
           'lint_warnings': 0, 'guide_languages': 4,
           'previous_ui_evidence': 'vk-greet.tar.gz',
           'new_live_provider_effects': 0, 'hosted_verification_pending': True,
           'issue_complete': False,
       }, 'issue-56-vk-greet/*.png', before=parent_reply_sources(root, work, parent))
