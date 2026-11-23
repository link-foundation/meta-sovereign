import { linkedinPositionFormHtml } from './linkedin-position-form-fixture.mjs';

export const linkedinPositionMediaHtml = ({
  existing,
  broken,
  previewUrl,
} = {}) =>
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
window.fixtureMediaRenames = 0;
window.fixtureLinkOpens = 0;
const list = document.querySelector('#attachments');
const typed = (input) => {
  const data = [];
  input.addEventListener('input', (event) => {
    if (event.isTrusted && event.inputType === 'insertText') data.push(event.data);
  });
  return data;
};
const showPreview = (modal, website, initial, rename, save) => {
  modal.innerHTML = '<h2></h2><a>Preview</a><label>Title<input></label><button type="button">Save</button>';
  modal.querySelector('h2').textContent = rename ? 'Edit media' : 'Link preview';
  modal.querySelector('a').href = website;
  const title = modal.querySelector('input');
  title.value = initial;
  const titleStrokes = typed(title);
  modal.querySelector('button').onclick = () => {
    if (titleStrokes.join('') !== title.value) return;
    save(title.value);
    modal.close();
  };
};
const appendLink = (item) => {
  const link = document.createElement('a');
  const editable = ${Boolean(previewUrl)};
  link.href = editable ? '#edit-media' : item.url;
  const update = () => { link.textContent = editable ? 'Edit media, ' + item.title : item.title; };
  update();
  if (editable) {
    link.onclick = (event) => {
      event.preventDefault();
      const modal = document.createElement('dialog');
      document.body.append(modal);
      showPreview(modal, ${JSON.stringify(previewUrl ?? '')}, item.title, true, (title) => {
        window.fixtureMediaRenames++;
        item.title = title;
        update();
      });
      modal.showModal();
    };
  }
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
  const urlStrokes = typed(url);
  modal.querySelector('button').onclick = () => {
    if (urlStrokes.join('') !== url.value || ${Boolean(broken)}) return;
    const website = url.value;
    showPreview(modal, website, 'Original site title', false, (title) => {
      window.fixtureMediaAttaches++;
      const item = { url: website, title };
      window.fixtureMedia.push(item);
      appendLink(item);
    });
  };
};
</script>`
    );
