import { hhChoiceHtml } from './hh-choice-fixture.mjs';

/** Native HH-shaped text effects at routed origins; no account or network. */
export const textReplyHtml = hhChoiceHtml.replace(
  '</html>',
  `<script>
document.querySelector('#send').dataset.qa='chatik-send-button';
document.querySelector('#send').onclick=()=>{
 fixture.textSends++;
 const body=document.querySelector('textarea').value;
 document.querySelector('#status').textContent='Native send dispatched; receipt pending';
 if(fixture.receipt==='none')return;
 const append=()=>{
  const row=document.createElement('article');row.dataset.qa='chatik-chat-message-102';
  const text=document.createElement('p');text.dataset.qa='chat-bubble-text';text.textContent=body;row.append(text);
  if(fixture.receipt!=='incoming'){
   row.className='outgoing';const status=document.createElement('span');status.dataset.qa='status-icon-delivered';row.append(status);
  }
  const history=document.querySelector('#history');
  if(fixture.receipt==='historical')history.prepend(row);else history.append(row);
  if(fixture.receipt==='duplicate'){const copy=row.cloneNode(true);copy.dataset.qa='chatik-chat-message-103';history.append(copy);}
  const input=document.querySelector('textarea');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('#status').textContent='Provider bubble added: '+body;
 };
 if(fixture.receipt==='delayed')setTimeout(append,50);else append();
};
window.textReplyState=()=>({
 sends:fixture.textSends, choices:fixture.clicks, draft:document.querySelector('textarea')?.value??null,
 hooks:document.querySelectorAll('[data-meta-answer-choice]').length,
 replies:[...document.querySelectorAll('[data-qa^="chatik-chat-message-"]')].map(n=>({id:n.dataset.qa,body:n.querySelector('p')?.textContent,outgoing:!!n.querySelector('[data-qa="status-icon-delivered"]')})),
});
</script></html>`
);

export const textReplyExpected = () => ({
  chat: '7',
  question: {
    id: '101',
    body: 'Do you have distributed systems experience?',
    outgoing: false,
  },
  strictOptions: false,
  answerOptions: [],
  pendingTurn: {
    boundary: { kind: 'rendered-start' },
    messages: [
      { id: '101', body: 'Do you have distributed systems experience?' },
    ],
  },
});
export const textReplyBody = 'Thank you. I have reviewed your message.';
