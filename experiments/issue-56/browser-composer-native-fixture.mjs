export const browserComposerHtml = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Isolated provider composer</title>
<style>
body{font:16px system-ui;background:#17181c;color:#eee;margin:32px auto;padding:0 20px;max-width:760px}
main{background:#24262c;padding:24px;border:1px solid #444;border-radius:12px}
[data-composer]{display:block;box-sizing:border-box;width:100%;min-height:100px;padding:12px;background:#16171a;color:#fff;border:1px solid #777;border-radius:8px;white-space:pre-wrap;font:inherit}
button{margin-top:12px;padding:8px 16px;background:#ddd;color:#181818;border:0;border-radius:8px}
li{white-space:pre-wrap;padding:12px;background:#30343b;margin-bottom:8px}
[role=status]{margin:16px 0;color:#c1c7d2}
</style><main data-ready><h1>Provider conversation fixture</h1>
<p>Owner: keep my draft intact</p><ol data-history></ol>
<div role="status">No provider send has been issued</div>
<label for="composer">Message</label><div id="composer" data-composer role="textbox" contenteditable="true" aria-label="Message"></div>
<button type="button">Send</button></main>
<script>
window.receipts=[];
const params=new URL(location.href).searchParams;
const prior=document.querySelector('[data-composer]');
if(params.get('kind')==='textarea'){
 const node=document.createElement('textarea');node.id='composer';node.dataset.composer='';node.setAttribute('aria-label','Message');prior.replaceWith(node);
}
const composer=document.querySelector('[data-composer]');
const write=(value)=>{if('value' in composer)composer.value=value;else composer.innerText=value;};
const read=()=>('value' in composer?composer.value:composer.innerText);
write(params.get('text') || params.get('draft') || '');
const send=()=>{
 const value=read();window.receipts.push(value);
 const li=document.createElement('li');li.textContent=value;document.querySelector('[data-history]').append(li);
 document.querySelector('[role=status]').textContent='Native Send issued: '+window.receipts.length;
 write('');
};
document.querySelector('button').addEventListener('click',send);
composer.addEventListener('keydown',(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send();}});
</script></html>`;
