/** An independently rendered, overlapping virtual list; every row is synthetic. */
export const hhChatScanHtml = ({
  loading = false,
  filter = false,
  unreadOnly = false,
  emptyUnread = false,
  filterApplies = true,
} = {}) => `<!doctype html><html lang="en">
<meta charset="utf-8"><title>HH virtual list · isolated fixture</title><style>
body{font:16px system-ui;margin:24px;background:#eef2f7;color:#172333}#list{height:220px;width:560px;overflow-y:auto;background:white;border:1px solid #adb9c9}article{box-sizing:border-box;position:absolute;height:100px;width:100%;padding:16px;border-bottom:1px solid #ddd}pre{white-space:pre-wrap}
</style><nav data-qa="mainmenu_applicantProfile">Synthetic applicant profile</nav>
<h1>Virtual employer conversations</h1><p>12 rows; only the current window is mounted. Initial scroll: 300px.</p>
${filter ? `<label id="filter-label"><input id="outer-filter" type="checkbox" ${unreadOnly ? 'checked' : ''}><label><input type="checkbox" data-qa="chatik-checkbox-only-unread" ${unreadOnly ? '' : 'checked'}>Unread conversations only · nested native control</label></label>` : ''}
<div id="list"><div id="rows" style="height:1200px;position:relative"></div>${loading ? '<span role="progressbar">Loading</span>' : ''}</div><pre id="result"></pre>
<article data-qa="chatik-open-chat-99" style="display:none">Hidden stale conversation</article>
<div data-qa="chatik-open-chat-98">Unrelated conversation shortcut outside the list</div>
<script>
const list=document.querySelector('#list'), rows=document.querySelector('#rows');
const outer=document.querySelector('#outer-filter');
function render(){const ids=Array.from({length:12},(_,i)=>i+1).filter(n=>${!filterApplies}||!outer?.checked||(${!emptyUnread}&&n%3!==0));rows.style.height=Math.max(1,ids.length*100)+'px';const first=Math.floor(list.scrollTop/100),last=Math.min(ids.length,first+4);rows.innerHTML=Array.from({length:Math.max(0,last-first)},(_,i)=>{const n=ids[first+i];return '<article style="top:'+((first+i)*100)+'px" data-qa="chatik-open-chat-'+n+'"><b data-qa="chat-cell-title">Employer '+n+'</b><div data-qa="chat-last-message">Question '+n+'</div><span data-qa="chat-cell-counter">'+(n%3)+'</span></article>';}).join('');}
outer?.addEventListener('change',()=>{list.scrollTop=0;render();});
list.addEventListener('scroll',render);list.scrollTop=300;render();
</script></html>`;

export const hhChatScanOwner = (
  frames
) => `<!doctype html><html><meta charset="utf-8">
<nav data-qa="mainmenu_applicantProfile">Synthetic owner page</nav>${frames.map(({ url, hidden = false }) => `<iframe src="${url}" style="width:850px;height:600px;${hidden ? 'display:none' : ''}"></iframe>`).join('')}</html>`;
