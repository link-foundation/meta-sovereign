export const PDF_INSTRUCTION_PAGES = [
  'Design a greenhouse irrigation schedule for the assigned site.',
  'Account for drought conditions and include a daily water audit.',
];

/** Build a tiny owned PDF with a real xref table and one paragraph per page. */
export const assignmentPdfFixture = (pages = PDF_INSTRUCTION_PAGES) => {
  const pageRefs = pages.map((_, index) => `${4 + 2 * index} 0 R`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs.join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  for (const [index, text] of pages.entries()) {
    const contentId = 5 + 2 * index;
    const lines = text.match(/.{1,70}/gu) ?? [];
    const paragraphs = lines.map(
      (line) => `(${line.replace(/[()\\]/gu, '\\$&')}) Tj`
    );
    const content = text
      ? `BT /F1 12 Tf 13 TL 40 780 Td ${paragraphs.join(' T* ')} ET\n`
      : '';
    objects.push(
      `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /MediaBox [0 0 595 842] /Contents ${contentId} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}endstream`
    );
  }
  let output = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = output.length;
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return `${String(offset).padStart(10, '0')} 00000 n `;
  });
  const xref = output.length;
  const table = ['0000000000 65535 f ', ...offsets].join('\n');
  output += `xref\n0 ${objects.length + 1}\n${table}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'ascii');
};
