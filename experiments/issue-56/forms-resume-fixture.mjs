// Synthetic one-page PDF; contains no account, contact or résumé data.
export const syntheticResumePdf = () => {
  const content = 'BT /F1 12 Tf 20 100 Td (Synthetic resume fixture) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  return Buffer.from(
    `${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  );
};

export const uploadFixtureHtml = (
  childBase
) => `<!doctype html><html lang="en"><meta charset="utf-8"><title>Reviewed résumé attachment</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}input{display:block;margin:12px}iframe{width:100%;height:160px}</style>
<form action="/submit" method="post"><label>Full name<input id="resume-name" value="Owner text"></label>
<label>Resume PDF<input type="file" id="main-resume" accept=".pdf,application/pdf"></label>
<label>Portrait photo<input type="file" id="portrait" accept="image/*"></label>
<label>CV documents<input type="file" id="multiple-resume" multiple accept=".pdf"></label>
<button type="submit">Submit</button><button type="button">Next</button>
<iframe title="Cross-origin résumé" src="${childBase}/upload"></iframe></form>
<script>globalThis.events=[];for(const type of ['input','change','submit'])document.addEventListener(type,e=>{events.push(type);if(type==='submit')e.preventDefault()});</script>`;

export const uploadChildHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Cross-origin CV</title><label>CV PDF<input type="file" id="child-resume" accept="application/pdf"></label><script>globalThis.events=[];for(const type of ['input','change','submit'])document.addEventListener(type,e=>events.push(type));</script>`;
