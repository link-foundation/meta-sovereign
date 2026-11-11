/** Finite SPA fixture: three synthetic chats, native history and per-chat drafts. */
export const chatNavigationHtml = ({
  loseDraft = false,
  changedDraft = false,
  replace = false,
  reload = false,
  virtual = false,
  allRead = false,
} = {}) => String.raw`<!doctype html><html lang="en">
<meta charset="utf-8"><title>Owned unread conversations · isolated fixture</title><style>
body{font:16px system-ui;margin:24px;color:#172333;background:#eef2f7}main{display:flex;gap:20px}#list{width:250px;height:200px;overflow-y:auto;background:white}#list article{box-sizing:border-box;height:100px;padding:14px;border-bottom:1px solid #ccc;cursor:pointer}#history{height:220px;width:620px;overflow-y:auto;overflow-anchor:none;background:white}#messages{height:800px;position:relative}#history article{box-sizing:border-box;position:absolute;height:100px;padding:12px}textarea{display:block;width:610px;height:65px;margin:12px 0}pre{white-space:pre-wrap;max-width:940px}
</style><nav data-qa="mainmenu_applicantProfile">Synthetic applicant profile</nav><h1>Owned unread conversation pass</h1>
<p>Offline fixture. Reading a conversation clears its unread counter; sending is never requested.</p>
<label><input id="outer-filter" type="checkbox"><label><input type="checkbox" checked data-qa="chatik-checkbox-only-unread">Unread conversations only</label></label>
<main><div id="list"></div><section><h2 id="chat-title"></h2><span data-qa="participant-info-title">Example employer</span><div data-qa="chatik-header-sub-header"><a href="https://hh.ru/vacancy/123">Example vacancy</a></div><div id="history"><div id="messages"></div></div><div id="composer"></div><button data-qa="send">Send</button></section></main><pre id="result">The owner's draft, selection and scroll must survive the pass.</pre>
<script>
const list=document.querySelector('#list'),filter=document.querySelector('#outer-filter'),pane=document.querySelector('#history'),messages=document.querySelector('#messages');
const ownerDraft=Array.from({length:8},(_,i)=>'Owner unfinished line '+i).join('\n');
const fixture=window.fixture={sends:0,visits:[],drafts:{'7':ownerDraft,'8':'','9':''},unread:{'7':0,'8':${allRead ? 0 : 1},'9':${allRead ? 0 : 1}},chat:'7'};
function renderList(){const ids=(${virtual}?['8','1','2','7','3','9']:['8','9','7']).filter(id=>!filter.checked||fixture.unread[id]>0);const first=${virtual}?Math.floor(list.scrollTop/100):0;list.innerHTML='<div style="position:relative;height:'+(ids.length*100)+'px">'+ids.slice(first,${virtual}?first+3:ids.length).map((id,i)=>'<article style="'+(${virtual}?'position:absolute;width:100%;top:'+((first+i)*100)+'px':'')+'" data-qa="chatik-open-chat-'+id+'"><b data-qa="chat-cell-title">Employer '+id+'</b><div data-qa="chat-last-message">A pending question</div><span data-qa="chat-cell-counter">'+fixture.unread[id]+'</span></article>').join('')+'</div>';for(const row of list.querySelectorAll('article'))row.onclick=()=>openChat(row.dataset.qa.replace('chatik-open-chat-',''));}
function renderMessages(){const first=Math.floor(pane.scrollTop/100);messages.innerHTML=Array.from({length:Math.min(4,8-first)},(_,i)=>{const n=first+i;return '<article style="top:'+(n*100)+'px" data-qa="chatik-chat-message-'+(Number(fixture.chat)*100+n)+'">'+(n===0?'<b data-qa="chat-bubble-title">Vacancy application</b>':'')+'<p data-qa="chat-bubble-text">'+(n===7?'What time can you start?':'Conversation record '+n)+'</p></article>';}).join('');}
function renderChat(){fixture.chat=location.pathname.match(/chat\/(\d+)/)?.[1]||'7';document.querySelector('#chat-title').textContent='Employer '+fixture.chat;document.querySelector('#composer').innerHTML='<textarea data-qa="text-input"></textarea>';const field=document.querySelector('textarea');field.value=fixture.drafts[fixture.chat]||'';field.oninput=()=>{fixture.drafts[fixture.chat]=field.value;};pane.scrollTop=300;renderMessages();renderList();}
function openChat(id){const field=document.querySelector('textarea');if(!(${loseDraft}&&fixture.chat==='7'))fixture.drafts[fixture.chat]=field.value;else fixture.drafts['7']='';fixture.visits.push(id);fixture.unread[id]=0;const url='/chat/'+id;if(${reload}){location.href=url;return;}window.history[${replace}?'replaceState':'pushState']({chat:id},'',url);renderChat();}
window.addEventListener('popstate',()=>{if(${changedDraft})fixture.drafts['7']='Owner draft changed elsewhere';renderChat();});pane.addEventListener('scroll',renderMessages);if(${virtual})list.addEventListener('scroll',renderList);filter.addEventListener('change',()=>{list.scrollTop=0;renderList();});document.querySelector('button').onclick=()=>fixture.sends++;
renderChat();list.scrollTop=100;const field=document.querySelector('textarea');field.setSelectionRange(6,16,'backward');field.scrollTop=24;
</script></html>`;
