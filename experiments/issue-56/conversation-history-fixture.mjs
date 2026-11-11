/** Finite virtualized HH transcript with a manual reply outside the first window. */
export const conversationHistoryIds = [
  13, 8, 92, 4, 73, 2, 61, 9, 47, 3, 38, 1,
];
export const conversationHistoryHtml = ({
  reversed = false,
  marker = true,
  loading = false,
} = {}) => `<!doctype html><html lang="en">
<meta charset="utf-8"><title>Conversation history · isolated fixture</title><style>
body{font:16px system-ui;margin:24px;background:#eef2f7;color:#172333}#history{height:220px;width:650px;overflow-y:auto;overflow-anchor:none;background:white;border:1px solid #adb9c9;${reversed ? 'display:flex;flex-direction:column-reverse;' : ''}}#rows{height:1200px;width:100%;position:relative;flex-shrink:0}article{box-sizing:border-box;position:absolute;height:100px;width:100%;padding:12px;border-bottom:1px solid #ddd}p{margin:5px 0}.outgoing{background:#e3f7ea}textarea{width:640px;height:65px;margin-top:12px}pre{white-space:pre-wrap;max-width:760px}
</style><nav data-qa="mainmenu_applicantProfile">Synthetic applicant profile</nav>
<h1>Conversation with an earlier manual reply</h1><p>12 records, overlapping mounted windows. ${reversed ? 'Reversed' : 'Ordinary'} scroll pane. No real account or messages.</p>
<div id="history"><div id="rows"></div>${loading ? '<span role="progressbar" style="position:absolute">Loading</span>' : ''}</div>
<textarea data-qa="text-input">Owner unfinished draft</textarea><pre id="result">Only the current window is mounted.</pre>
<script>
const ids=${JSON.stringify(conversationHistoryIds)}, reversed=${reversed}, marker=${marker};
const history=document.querySelector('#history'),rows=document.querySelector('#rows'),composer=document.querySelector('textarea');
const records=ids.map((id,index)=>({id,index,body:index===0?'':index===2?'I already replied manually.':index===11?'Thank you, we selected another candidate.':'Conversation record '+index,outgoing:index===2}));
window.fixture={records,reads:0,clicks:0,sends:0,jump:false,render};
function render(){const position=reversed?1200-history.clientHeight+history.scrollTop:history.scrollTop;const first=window.fixture.jump?0:Math.max(0,Math.floor(position/100)),last=Math.min(12,first+4);rows.innerHTML=records.slice(first,last).map(record=>'<article class="'+(record.outgoing?'outgoing':'')+'" style="top:'+(record.index*100)+'px" data-qa="chatik-chat-message-'+record.id+'" data-time="2026-11-11T10:00:00Z">'+(record.index===0&&marker?'<strong data-qa="chat-bubble-title">Vacancy application</strong>':'')+'<p data-qa="chat-bubble-text">'+record.body+'</p>'+(record.outgoing?'<span data-qa="status-icon-delivered">Sent</span>':'')+'</article>').join('');}
history.addEventListener('scroll',render);history.scrollTop=reversed?-300:300;render();composer.setSelectionRange(6,16);
</script></html>`;
