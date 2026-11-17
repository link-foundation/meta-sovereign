import { chatNavigationHtml } from './chat-navigation-fixture.mjs';

export const unreadBotChoiceQuestion = 'Do you have the experience?';

/** Native buttons and delivered bubbles in the existing isolated three-chat SPA. */
export const unreadBotChoiceHtml = () =>
  chatNavigationHtml({
    textReplies: true,
    precedingOutgoing: true,
    latestMessages: { 8: unreadBotChoiceQuestion },
  }).replace(
    '</script>',
    String.raw`
fixture.choiceClicks=0;
const renderWithoutChoices=renderMessages;
renderMessages=()=>{
 renderWithoutChoices();
 if(fixture.chat!=='8'||fixture.replies['8'])return;
 const row=messages.querySelector('[data-qa="chatik-chat-message-807"]');
 if(!row)return;
 const group=document.createElement('div');group.dataset.qa='answer-options';
 for(const label of ['Yes','No']){
  const button=document.createElement('button');button.textContent=label;
  button.onclick=()=>{fixture.choiceClicks++;fixture.replies['8']=label;renderMessages();};
  group.append(button);
 }
 row.append(group);
};
</script>`
  );
