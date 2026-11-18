/** Native HH list contract, routed offline; no provider code or account data. */
export const hhChatListHtml = `<!doctype html><html lang="en"><meta charset="utf-8">
<title>HH chat list · isolated contract fixture</title><style>
body{font:17px system-ui;background:#edf1f7;color:#20252b;margin:28px;max-width:850px}
h1{font-size:25px}article,a{display:block;background:white;border-radius:10px;padding:18px;margin:10px 0;color:inherit;text-decoration:none}
[data-qa="chat-cell-title"]{font-weight:650}span{margin-right:12px}pre{white-space:pre-wrap;background:#172333;color:#dfeefa;padding:18px;border-radius:10px}
</style><nav data-qa="mainmenu_applicantProfile">Applicant profile · synthetic offline fixture</nav>
<h1>Employer conversations</h1><p>The adapter reads IDs and unread badges without opening a conversation.</p>
<article data-qa="chatik-open-chat-7"><div data-qa="chat-cell-title">Example employer</div><span class="last-message-color_red">Rejection</span><span data-qa="chat-cell-counter">3</span><a href="/chat/7">Open conversation</a></article>
<article data-qa="chatik-open-chat-8"><div data-qa="chat-cell-title">Another employer</div><span class="last-message-color_green">Invitation</span><span data-qa="chat-cell-badge"></span></article>
<article data-qa="chatik-open-chat-9"><div data-qa="chat-cell-title">Read conversation</div><span data-qa="chat-last-message">Thank you.</span></article>
<pre id="result">Read result pending</pre></html>`;
