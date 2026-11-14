/** Synthetic two-page form: only an explicit owner submission shows success. */
export const learningFixtureHtml = (
  second
) => `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Reusable answers page ${second ? 2 : 1}</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}label,input,textarea,button{display:block;margin:8px 0}</style>
<h1>Reusable answers page ${second ? 2 : 1}</h1>
<form action="/learning-submit" method="post">
<label>${second ? 'Availability notes' : 'Company context'}<textarea name="learningAnswer">${second ? '' : 'Unchanged existing prefill'}</textarea></label>
<label>Password <input type="password" name="password" value="learning-secret-canary"></label>
${second ? '<button type="submit">Gửi</button>' : '<button type="button" id="next">Tiếp theo →</button>'}
</form><script>
globalThis.events=[];
for(const name of ['input','change','click','submit'])document.addEventListener(name,()=>events.push(name));
document.querySelector('#next')?.addEventListener('click',()=>{location.href='/learning?page=2'});
document.querySelector('form').addEventListener('submit',async event=>{
 event.preventDefault();
 const response=await fetch('/learning-submit',{method:'POST'});
 if(response.ok)document.querySelector('form').outerHTML='<p role="status">Câu trả lời của bạn đã được ghi lại</p>';
});
Object.defineProperty(document.querySelector('[name="password"]'),'value',{get(){throw new Error('Password read')}});
</script>`;
