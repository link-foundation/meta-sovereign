import { saveAnswerProfile } from '../../js/src/automation/question-profiles.js';

export const formPlace = {
  location: 'Нячанг, Вьетнам',
  timezone: 'UTC+7, МСК+4',
};
export const cityOffsetLabel = 'Ваш город и сколько от мск (+- х мск)';
export const seedFormPlace = (store) =>
  saveAnswerProfile(store, {
    id: 'form-place',
    name: 'City and time zone',
    values: formPlace,
  });
export const timezoneFixtureHtml = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>City and time zone</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}label,input,textarea{display:block;margin:8px 0}input,textarea{width:100%}</style>
<form action="/submit" method="post">
<label>${cityOffsetLabel}<input name="cityMsk"></label>
<label>City and UTC offset<textarea name="cityUtc"></textarea></label>
<label>Time zone<input name="zoneOnly"></label>
<label>Город<input name="cityOnly"></label>
<label>City and GMT offset<input name="ownerCity" value="Owner keeps this city"></label>
<label>Describe UTC timestamp handling<textarea name="technical"></textarea></label>
<button type="submit">Submit</button></form>
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));</script>`;
