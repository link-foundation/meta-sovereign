/** Synthetic native controls; no accounts, external navigation or live submissions. */
export const prefillFixtureHtml = (
  childBase
) => `<!doctype html><html lang="en"><title>Reviewed application</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}label,input,textarea,select{display:block;margin:8px 0}iframe{width:100%;height:240px}</style>
<form action="/submit" method="post">
<label>Full name <input name="fullName" value="Owner's current answer"></label>
<label>Email <input name="email" type="email"></label>
<label>Location <select name="location"><option value="" selected>Choose a location</option><option value="vn">Vietnam</option></select></label>
<label>Receive email updates <input name="newsletter" type="checkbox"></label>
<label>Availability <input name="start" type="date"></label>
<label>Preferred language <textarea name="language"></textarea></label>
<button type="submit" onclick="navigationClicks++">Submit</button><button type="button" onclick="navigationClicks++">Next</button>
<iframe title="External location question" src="${childBase}/prefill"></iframe>
</form><script>
globalThis.events=[];globalThis.navigationClicks=0;
for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));
</script>`;
