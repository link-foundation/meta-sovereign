/** Synthetic provider DOM. No account, cookie or live provider is used. */
export const providerChoiceHtml = `<!doctype html><html lang="en"><meta charset="utf-8">
<title>Provider answer choice fixture</title><style>
body{font:17px system-ui;max-width:680px;margin:50px auto;padding:20px;background:#f5f6f8;color:#20252b}
article{background:white;border:1px solid #d8dde5;border-radius:12px;padding:16px;margin:12px 0}
button,textarea{font:inherit;padding:12px;border:1px solid #a7b1c0;border-radius:8px;margin:5px}
textarea{display:block;width:90%;height:70px}h1{font-size:24px}.outgoing{margin-left:80px;background:#e4f3e6}
</style><h1>Employer conversation · isolated fixture</h1>
<main id="history"><article data-qa="chatik-chat-message-101" data-time="2026-11-11T10:00:00Z">
<strong>Recruiter bot</strong><p data-qa="chat-bubble-text">Do you have distributed systems experience?</p></article></main>
<div id="choices"></div><div id="starters"><button>Hello</button><button>Какой график работы?</button></div>
<label>Provider composer<textarea data-qa="text-input"></textarea></label><button id="send">Send text</button>
<p id="status" role="status">No answer sent</p>
<script>
window.fixture={clicks:0,textSends:0,receipt:'normal'};
window.mountChoices=(labels=['Yes.','No.'],disabled=false)=>{
 const root=document.querySelector('#choices'); root.className='reply-options';
 root.replaceChildren(...labels.map(label=>{
  const button=document.createElement('button');button.textContent=label;button.disabled=disabled;
  button.onclick=()=>{
   fixture.clicks++;document.querySelector('#status').textContent='Selected '+label;
   if(fixture.receipt==='none')return;
   const append=()=>{
    const row=document.createElement('article');row.dataset.qa='chatik-chat-message-102';row.className=fixture.receipt==='incoming'?'':'outgoing';
    const p=document.createElement('p');p.dataset.qa='chat-bubble-text';p.textContent=label;row.append(p);
    if(fixture.receipt==='historical')document.querySelector('#history').prepend(row);else document.querySelector('#history').append(row);
    if(fixture.receipt==='duplicate'){const copy=row.cloneNode(true);copy.dataset.qa='chatik-chat-message-103';document.querySelector('#history').append(copy);}
   };
   if(fixture.receipt==='delayed')setTimeout(append,100);else append();
  };return button;
 }));
};
document.querySelector('#send').onclick=()=>fixture.textSends++;
</script></html>`;

export const providerChoiceUi = (base) => ({
  id: 'hh',
  name: 'Isolated HH markup fixture',
  loginUrl: base,
  chatUrl: (chat) => `${base}/chat/${chat}`,
  target: ({ chat, to }) => chat ?? to,
  loggedIn: '#history',
  loggedOut: '#login',
  composer: 'textarea[data-qa="text-input"]',
  send: { selector: '#send' },
  location: { origins: [base], pathPattern: '^/chat/(\\d+)$' },
  choices: {
    group: '.reply-options',
    button: 'button,[role="button"],[role="option"]',
  },
  messages: {
    item: '[data-qa^="chatik-chat-message-"]',
    idAttribute: 'data-qa',
    idPattern: '^chatik-chat-message-(\\d+)$',
    body: '[data-qa="chat-bubble-text"]',
    outgoing: '.outgoing',
    timestampAttribute: 'data-time',
  },
});

export const providerChoiceDraft = (options = ['Yes.', 'No.']) => ({
  source: 'hh',
  chat: '7',
  text: 'Yes.',
  answer: {
    strictOptions: true,
    option: 'Yes.',
    complete: true,
    message: 'msg:hh:7:101',
    turn: {
      messages: [
        {
          id: 'msg:hh:7:101',
          body: 'Do you have distributed systems experience?',
          options: JSON.stringify(options),
        },
      ],
    },
  },
});
