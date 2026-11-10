export const customFixtureHtml = (
  childBase
) => `<!doctype html><html lang="en"><title>Custom questionnaire review</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}[role=radio],[role=checkbox],[role=option],[contenteditable]{border:1px solid #aaa;padding:8px;margin:4px}iframe{width:100%;height:140px}</style>
<form action="/submit" method="post">
<div id="custom-name" role="textbox" contenteditable="true" aria-label="Full name"></div>
<div id="custom-updates" role="checkbox" tabindex="0" aria-label="Receive email updates" aria-checked="false">Receive email updates</div>
<div role="radiogroup" aria-label="Work arrangement"><div id="custom-remote" role="radio" tabindex="0" aria-label="Remote" aria-checked="false">Remote</div><div id="custom-office" role="radio" tabindex="0" aria-label="Office" aria-checked="true">Office</div></div>
<div id="custom-language" role="listbox" aria-label="Preferred language"><div role="option" data-value="hi" aria-selected="true">Hindi</div><div id="custom-english" role="option" data-value="en" aria-selected="false">English</div></div>
<input id="custom-arrangement" role="combobox" aria-label="Work arrangement" aria-controls="arrangement-list" aria-expanded="true" value="Office">
<div id="arrangement-list" role="listbox"><div role="option" data-value="office" aria-selected="true">Office</div><div id="combo-remote" role="option" data-value="remote" aria-selected="false">Remote</div></div>
<div role="radiogroup" aria-label="Work arrangement"><div id="hidden-group-remote" role="radio" aria-label="Remote" aria-checked="false">Remote</div><div role="radio" hidden aria-label="Office" aria-checked="true">Office</div></div>
<div role="radiogroup" aria-label="Work arrangement" aria-owns="outside-option"><div id="owned-group-remote" role="radio" aria-label="Remote" aria-checked="false">Remote</div></div><div id="outside-option" role="radio" aria-label="Office" aria-checked="true">Office</div>
<div id="unknown-check" role="checkbox" aria-label="Receive email updates">Unknown checkbox state</div>
<button id="submit-trap" role="checkbox" aria-checked="false" aria-label="Receive email updates">Submit trap</button>
<div id="hidden-choice" role="listbox" aria-label="Preferred language"><div role="option" data-value="hi" aria-selected="true">Hindi</div><div role="option" data-value="en" hidden aria-selected="false">English</div></div>
<div id="duplicate-choice" role="listbox" aria-label="Preferred language"><div role="option" data-value="same" aria-selected="true">Hindi</div><div role="option" data-value="same" aria-selected="false">English</div></div>
<button type="submit">Submit</button><button type="button">Next</button>
<iframe title="Cross-origin custom field" src="${childBase}/custom"></iframe></form>
<script>
globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>{events.push(name);if(name==='submit')e.preventDefault()});
document.addEventListener('click',e=>{const node=e.target;if(node.getAttribute('role')==='checkbox')node.setAttribute('aria-checked',String(node.getAttribute('aria-checked')!=='true'));if(node.getAttribute('role')==='radio'){for(const peer of node.closest('[role=radiogroup]').querySelectorAll('[role=radio]'))peer.setAttribute('aria-checked',String(peer===node));}if(node.getAttribute('role')==='option'){for(const peer of node.parentElement.querySelectorAll('[role=option]'))peer.setAttribute('aria-selected',String(peer===node));if(node.parentElement.id==='arrangement-list'){document.querySelector('#custom-arrangement').value=node.textContent;document.querySelector('#custom-arrangement').setAttribute('aria-expanded','false');node.parentElement.hidden=true;}}});
</script>`;

export const customChildHtml = `<!doctype html><html lang="en"><title>Embedded custom field</title><div id="custom-city" role="textbox" contenteditable="true" aria-label="City and time zone"></div><script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));</script>`;
