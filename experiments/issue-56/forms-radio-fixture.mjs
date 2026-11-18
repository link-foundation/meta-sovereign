export const radioFixtureHtml = (
  childBase
) => `<!doctype html><html lang="en"><title>Native radio review</title>
<style>body{font:16px system-ui;margin:24px}fieldset{margin:12px}iframe{width:100%;height:200px}</style>
<form id="application"><fieldset><legend>Work arrangement</legend><label>Remote <input id="main-remote" type="radio" name="arrangement" value="remote"></label></fieldset>
<fieldset><legend>Work arrangement</legend><label>Office <input id="main-office" type="radio" name="arrangement" value="office" checked></label></fieldset>
<button type="submit">Submit</button><button type="button">Next</button></form>
<fieldset><legend>Work arrangement</legend><label>Hybrid <input id="main-hybrid" form="application" type="radio" name="arrangement" value="hybrid"></label></fieldset>
<form id="other"><fieldset><legend>Work arrangement</legend><label>Remote <input id="other-remote" type="radio" name="arrangement" value="remote"></label><label>Office <input id="other-office" type="radio" name="arrangement" value="office" checked></label></fieldset></form>
<form><fieldset><legend>Work arrangement</legend><label>Remote <input id="hidden-peer-remote" type="radio" name="protected" value="remote"></label><label hidden>Office <input type="radio" name="protected" value="office" checked></label></fieldset></form>
<fieldset><legend>Work arrangement</legend><label>Remote <input id="unnamed-one" type="radio" value="remote"></label><label>Remote <input id="unnamed-two" type="radio" value="remote"></label></fieldset>
<iframe title="Cross-origin radio group" src="${childBase}/radio"></iframe>
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>{events.push(name);if(name==='submit')e.preventDefault()});</script>`;

export const radioChildHtml = `<!doctype html><html lang="en"><title>Embedded radio group</title><form><fieldset><legend>Work arrangement</legend><label>Remote <input id="child-remote" type="radio" name="arrangement" value="remote"></label><label>Office <input id="child-office" type="radio" name="arrangement" value="office" checked></label></fieldset></form><script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));</script>`;
