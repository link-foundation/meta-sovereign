import { saveAnswerProfile } from '../../js/src/automation/question-profiles.js';

export const formPayProfile = {
  salary: '450 000 ₽ net per month',
  rate: '2 700 ₽ net per hour',
};
export const formPayIntro =
  'Стоимость за занятие 3000р. на руки. Продолжительность занятия — 1,5 часа.';
export const formPayAnswer =
  'Минимум — 2 000 ₽ в час на руки. Комфортная ставка — 2 700 ₽ в час на руки.';
export const seedFormPay = (store) =>
  saveAnswerProfile(store, {
    id: 'form-pay',
    name: 'Salary and comfortable rate',
    values: formPayProfile,
  });
export const payFixtureHtml = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Teaching application</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}label,textarea{display:block;margin:8px 0}textarea{width:100%}</style>
<form action="/submit" method="post">
<h1>Анкета для преподавателей</h1><p>${formPayIntro}</p>
<p hidden>Pay: USD 10 per hour</p>
<label>На какую оплату в час рассчитываете?<textarea name="hourly"></textarea></label>
<label>Ваши зарплатные ожидания в месяц на руки?<textarea name="monthly"></textarea></label>
<label>На какую оплату в час рассчитываете?<textarea name="ownerPay">Owner keeps this pay answer</textarea></label>
<label>Describe payroll database design<textarea name="technical"></textarea></label>
<button type="submit">Submit</button></form>
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));</script>`;
