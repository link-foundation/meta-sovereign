export const taskDetails =
  'Include a ledger reconciliation report and document how incomplete records are recovered.';
export const taskDescription = `Test task Design a ledger import that keeps an audit trail. ${taskDetails}`;

export const taskSection = `
  <section id="assignment">
    <header><h2>Test task</h2></header>
    <p>Design a ledger import that keeps an audit trail.</p>
    <ul><li>${taskDetails}</li></ul>
    <p hidden>Hidden fixture value</p>
    <div contenteditable="true" role="textbox">Private editable fixture value</div>
    <textarea>Private native fixture value</textarea>
  </section>`;

export const assignmentSectionHtml = (section = taskSection) => `<!doctype html>
  <html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Application</title>
  <form>
    <h1>Application</h1>
    <label>Full name <input name="name" value="Owner's text"></label>
    ${section}
    <label>English level? <input name="english"></label>
    <button type="submit">Submit</button>
  </form><script>
    globalThis.submissions = 0;
    document.querySelector('form').onsubmit = (event) => {
      event.preventDefault();
      globalThis.submissions++;
    };
  </script></html>`;
