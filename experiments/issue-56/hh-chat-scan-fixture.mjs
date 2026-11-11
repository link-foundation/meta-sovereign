/** An independently rendered, overlapping virtual list; every row is synthetic. */
export const hhChatScanHtml = ({
  loading = false,
} = {}) => `<!doctype html><html lang="en">
<meta charset="utf-8"><title>HH virtual list · isolated fixture</title><style>
body{font:16px system-ui;margin:24px;background:#eef2f7;color:#172333}#list{height:220px;width:560px;overflow-y:auto;background:white;border:1px solid #adb9c9}article{box-sizing:border-box;position:absolute;height:100px;width:100%;padding:16px;border-bottom:1px solid #ddd}pre{white-space:pre-wrap}
</style><nav data-qa="mainmenu_applicantProfile">Synthetic applicant profile</nav>
<h1>Virtual employer conversations</h1><p>12 rows; only the current window is mounted. Initial scroll: 300px.</p>
<div id="list"><div id="rows" style="height:1200px;position:relative"></div>${loading ? '<span role="progressbar">Loading</span>' : ''}</div><pre id="result"></pre>
<article data-qa="chatik-open-chat-99" style="display:none">Hidden stale conversation</article>
<div data-qa="chatik-open-chat-98">Unrelated conversation shortcut outside the list</div>
<script>
const list=document.querySelector('#list'), rows=document.querySelector('#rows');
function render(){const first=Math.floor(list.scrollTop/100),last=Math.min(12,first+4);rows.innerHTML=Array.from({length:last-first},(_,i)=>{const n=first+i+1;return '<article style="top:'+((n-1)*100)+'px" data-qa="chatik-open-chat-'+n+'"><b data-qa="chat-cell-title">Employer '+n+'</b><div data-qa="chat-last-message">Question '+n+'</div><span data-qa="chat-cell-counter">'+(n%3)+'</span></article>';}).join('');}
list.addEventListener('scroll',render);list.scrollTop=300;render();
</script></html>`;

export const hhChatScanOwner = (
  frames
) => `<!doctype html><html><meta charset="utf-8">
<nav data-qa="mainmenu_applicantProfile">Synthetic owner page</nav>${frames.map(({ url, hidden = false }) => `<iframe src="${url}" style="width:850px;height:600px;${hidden ? 'display:none' : ''}"></iframe>`).join('')}</html>`;
