import { linkedinPositionFormHtml } from './linkedin-position-form-fixture.mjs';

export const linkedinPositionMediaHtml = ({ existing, broken } = {}) =>
  linkedinPositionFormHtml({ actions: true })
    .replace(
      '<button type="button" id="cancel">',
      `<fieldset id="media" data-testid="fixture-position-mediaUiCollection"><legend>Media</legend>
<div id="attachments"></div>
<button type="button" id="add-media" aria-controls="media-menu">Add media</button>
<div id="media-menu" role="menu" hidden><button type="button" role="menuitem">Add a link</button></div>
</fieldset><button type="button" id="cancel">`
    )
    .replace(
      '</script>',
      `
window.fixtureMedia = ${JSON.stringify(existing ? [existing] : [])};
window.fixtureMediaAttaches = 0;
window.fixtureLinkOpens = 0;
const list = document.querySelector('#attachments');
const appendLink = ({ url, title }) => {
  const link = document.createElement('a');
  link.href = url;
  link.textContent = title;
  list.append(link);
};
window.fixtureMedia.forEach(appendLink);
const menu = document.querySelector('#media-menu');
document.querySelector('#add-media').onclick = () => { menu.hidden = false; };
menu.firstElementChild.onclick = () => {
  menu.hidden = true;
  window.fixtureLinkOpens++;
  const modal = document.createElement('dialog');
  modal.innerHTML = '<h2>Add media</h2><input aria-label="Paste or type a link"><button type="button">Add</button>';
  document.body.append(modal);
  modal.showModal();
  const url = modal.querySelector('input');
  const typed = (input) => {
    const data = [];
    input.addEventListener('input', (event) => {
      if (event.isTrusted && event.inputType === 'insertText') data.push(event.data);
    });
    return data;
  };
  const urlStrokes = typed(url);
  modal.querySelector('button').onclick = () => {
    if (urlStrokes.join('') !== url.value || ${Boolean(broken)}) return;
    const website = url.value;
    modal.innerHTML = '<h2>Link preview</h2><a>Preview</a><label>Title<input value="Original site title"></label><button type="button">Save</button>';
    modal.querySelector('a').href = website;
    const title = modal.querySelector('input');
    const titleStrokes = typed(title);
    modal.querySelector('button').onclick = () => {
      if (titleStrokes.join('') !== title.value) return;
      window.fixtureMediaAttaches++;
      const item = { url: website, title: title.value };
      window.fixtureMedia.push(item);
      appendLink(item);
      modal.close();
    };
  };
};
</script>`
    );
