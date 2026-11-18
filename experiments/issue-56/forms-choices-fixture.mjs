export const choicesFixtureHtml = (
  childBase
) => `<!doctype html><html lang="en"><title>Closed choice inspection</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}input,button,[role=option]{display:block;padding:8px;margin:8px}iframe{width:100%;height:220px}</style>
<form action="/submit" method="post">
<label>Full name<input id="choice-name" value="Owner text"></label>
<input id="closed-work" role="combobox" aria-label="Work arrangement" aria-expanded="false" aria-controls="work-options" value="Office">
<div id="work-options" role="listbox" hidden><div role="option" data-value="office" aria-selected="true">Office</div><div id="work-remote" role="option" data-value="remote" aria-selected="false">Remote</div></div>
<button id="choice-submit-trap" role="combobox" aria-label="Preferred language" aria-expanded="false">Submit trap</button>
<div role="combobox" aria-label="Menu, not a listbox" aria-expanded="false" aria-haspopup="menu">Menu</div>
<button type="submit">Submit</button><button type="button">Next</button>
<iframe title="Lazy cross-origin choices" src="${childBase}/choices"></iframe></form>
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>{events.push(name);if(name==='submit')e.preventDefault()});
document.addEventListener('click',e=>{const n=e.target;const combo=document.querySelector('#closed-work');const list=document.querySelector('#work-options');if(n===combo){list.hidden=false;combo.setAttribute('aria-expanded','true');}if(n.getAttribute('role')==='option'){for(const peer of list.children)peer.setAttribute('aria-selected',String(peer===n));combo.value=n.textContent;combo.setAttribute('aria-expanded','false');list.hidden=true;}});</script>`;

export const choicesChildHtml = `<!doctype html><html lang="en"><title>Lazy language choices</title><input id="lazy-language" role="combobox" aria-label="Preferred language" aria-expanded="false" aria-controls="language-options" value="Hindi">
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));
document.addEventListener('click',e=>{const n=e.target;const combo=document.querySelector('#lazy-language');let list=document.querySelector('#language-options');if(n===combo){if(!list){list=document.createElement('div');list.id='language-options';list.setAttribute('role','listbox');list.innerHTML='<div role="option" aria-selected="true" data-value="hi">Hindi</div><div id="lazy-english" role="option" aria-selected="false" data-value="en">English</div>';document.body.append(list);}list.hidden=false;combo.setAttribute('aria-expanded','true');}if(n.getAttribute('role')==='option'){for(const peer of list.children)peer.setAttribute('aria-selected',String(peer===n));combo.value=n.textContent;combo.setAttribute('aria-expanded','false');list.hidden=true;}});</script>`;
