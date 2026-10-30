# Conversation facts and contextual suggestions

Conversation learning is on by default. Settings → Conversation learning has
a master switch and separate switches for facts, question/answer tracking and
contextual suggestions. Choices persist in the browser and the selected server
account. Disabling learning leaves source messages intact. Existing historical
reply autocomplete is separate from these context rules.

The About panel derives a compact outline from stored personal conversations:

- How the participants address each other, with explicit agreement distinguished
  from observed usage.
- Work and profession, including a confirmed answer to a profession question.
  A negative answer is retained as negative evidence, not a positive profession.
- Profiles shared in the conversation, including GitHub. Sharing a profile does
  not prove external ownership; the cached view does not verify it online.
- Reciprocal friendship agreements, supported by the proposal and acceptance.
- Questions from both participants and their responses, grouped by subject.
- Topic continuations supported by explicit reply links. Replying months later
  to an affirmative programmer answer can connect that work topic to GitHub.

Explicit replies take priority over adjacent turns. Uncertain answers,
third-person profession questions, unrelated reply threads and forwarded
profession statements must not establish a confirmed personal fact. Evidence
buttons navigate to the actual message. The outline is rule-based; it is not a
claim to understand every sentence or resolve every ambiguous response.

The composer combines these rules with historical replies. An empty new
conversation can offer a greeting. A confirmed programmer can prompt a GitHub
question, confirmed availability can prompt a profile-link request, and a known
profile prevents repeatedly asking for it. Selecting an earlier answer supplies
that answer's context rather than the latest unrelated message. Once the profile
is known, resuming the programmer thread can offer a project question. Clicking
a suggestion only fills the composer: it never sends, acknowledges unread
messages, advances Operator or runs an automation.

The same rules operate on normalized messages across providers, with localized
follow-ups for English, Russian, Chinese and Hindi. Personal-profile learning
excludes group and bot conversations. Extra Telegram accounts keep separate
facts, settings and reply models. Server policy also limits requests from an
older or differently configured browser.

## Data and resource limits

Analysis reads only projected message fields from the existing archive. It does
not copy raw provider payloads, start a new import, fetch profiles or send read
receipts. Closing the browser does not stop the server's existing message
archive; facts can be derived again from those stored messages later. Messages
never observed by the archive cannot be reconstructed.

History is loaded on demand in pages, limited to 20,000 messages and an estimated
2 MiB per conversation. The in-memory cache is limited to 48 conversations and
an estimated 8 MiB, including learned results and one compact selected-message
result per entry. Edits and removals invalidate the chat revision, including
edits that keep the same message count. An older selected message outside the
main window loads a bounded neighborhood. The About panel labels partial history
instead of presenting it as complete.

The `people_learned` diagnostic event records message/fact/question counts,
duration, truncation and cache usage. It omits message text and profile handles.
There is no new archive-wide scan or continuously running analysis task.

The storage layer also derives standard adapter token/child-link arrays from
the message's existing identifiers instead of retaining duplicate arrays and
strings for every archived message. Nonstandard arrays remain stored exactly.
Resource diagnostics include constant-cost retention counters and logical
identifier bytes avoided; these estimates are not a claim about physical RAM.

## Validation

Focused fixtures cover conservative inference, explicit replies, old selected
answers, in-place edits, opt-outs, payload isolation, cache bounds and account
isolation. The browser fixture checks Chat and Operator, evidence navigation,
default settings, persistent opt-outs and fill-only suggestions without sends or
read receipts. Full runtime/browser coverage runs in CI.

A read-only audit also examined four cached private conversation windows (19,
80, 5 and 2 messages). The 19-message example yielded the confirmed profession,
friendship agreement, informal address and shared profile, and connected the
later profile question to the earlier answer. Committed fixtures use synthetic
identifiers and profile names; private audit data is not in the repository.
