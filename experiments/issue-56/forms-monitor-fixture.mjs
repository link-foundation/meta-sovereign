/** Two real documents: Next replaces the current page immediately. */
export const monitorChildHtml = (
  hidden
) => `<!doctype html><title>Embedded capture</title>
<label>Embedded detail <input name="embedded" value="${hidden ? 'hidden-frame-canary' : 'Visible embedded answer'}"></label>
<script>globalThis.events=[];</script>`;

export const monitorFixtureHtml = (
  childBase,
  second
) => `<!doctype html><html lang="en"><meta charset="utf-8"><title>Questionnaire page ${second ? 2 : 1}</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}label,input,textarea,button{display:block;margin:8px 0}iframe{width:100%;height:90px}</style>
<form action="/monitor-submit" method="post">
<h1>Questionnaire page ${second ? 2 : 1}</h1>
<label>${second ? 'Availability notes' : 'Company context'}<textarea name="monitorAnswer"></textarea></label>
<label>Password <input type="password" name="password" value="monitor-password-canary"></label>
<input type="hidden" value="hidden-control-canary">
${second ? '<button type="submit">Send</button>' : '<button type="button" id="next">Tiếp theo →</button>'}
<iframe title="Visible embedded questions" src="${childBase}/monitor-visible"></iframe>
<iframe hidden title="Hidden embedded questions" src="${childBase}/monitor-hidden"></iframe>
</form>
<script>
globalThis.events=[];
for(const name of ['input','change','click','submit'])document.addEventListener(name,()=>events.push(name));
document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();fetch('/monitor-submit',{method:'POST'})});
document.querySelector('#next')?.addEventListener('click',()=>{globalThis.location.href='/monitor?page=2'});
Object.defineProperty(document.querySelector('[name="password"]'),'value',{get(){throw new Error('Password was read')}});
</script>`;
