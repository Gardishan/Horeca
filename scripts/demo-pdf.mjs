function printableText(value, name) {
  if (typeof value !== "string" || !/^[\x20-\x7e]{1,80}$/.test(value) || !value.trim()) {
    throw new TypeError(`Demo PDF ${name} must contain 1 to 80 printable ASCII characters.`);
  }
  return value;
}

function literal(value) {
  return value.replace(/[\\()]/g, "\\$&");
}

function lines(value) {
  return value.match(/.{1,48}/g) ?? [];
}

/** Build a deterministic single-page fixture, never a real business document. */
export function createDemoPdf({ title, reference } = {}) {
  printableText(title, "title");
  if (reference !== undefined) printableText(reference, "reference");

  const body = [
    ...lines(`Document: ${title}`),
    ...(reference === undefined ? [] : lines(`Reference: ${reference}`)),
    "",
    "Synthetic demonstration document.",
    "Not valid for identity, registration or payment.",
    "Contains no real company or payment details.",
  ];
  const content = Buffer.from([
    "BT", "/F1 20 Tf", "54 778 Td", "(HORECA KZ - DEMO ONLY) Tj",
    "/F1 10 Tf", "0 -36 Td",
    ...body.flatMap((line, index) => [
      ...(index ? ["0 -18 Td"] : []), `(${literal(line)}) Tj`,
    ]),
    "ET", "",
  ].join("\n"), "ascii");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content.toString("ascii")}endstream`,
  ];
  const chunks = [Buffer.from("%PDF-1.4\n% HoReCa KZ deterministic demo fixture\n", "ascii")];
  const offsets = [0];
  let length = chunks[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(length);
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, "ascii");
    chunks.push(chunk);
    length += chunk.length;
  }
  chunks.push(Buffer.from([
    "xref", `0 ${objects.length + 1}`, "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer", `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref", String(length), "%%EOF", "",
  ].join("\n"), "ascii"));
  return Buffer.concat(chunks);
}
