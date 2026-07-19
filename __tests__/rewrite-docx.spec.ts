import JSZip from "jszip";
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  buildFormattedDocx,
  buildPlainDocx,
  DocxStructureMismatchError,
} from "@/lib/docx";

// Builds a small, realistic multi-paragraph .docx (one bold heading-style
// paragraph, two plain paragraphs — mirrors a resume's real shape) to use
// as a "real" original template in these tests. No real DOCX-format resume
// exists in this repo's fixture data (only a PDF), so this is the honest
// stand-in: a genuinely valid OOXML file with real run-level formatting to
// preserve, built with the same `docx` package used elsewhere in this repo.
async function buildTestDocx(paragraphs: { text: string; bold?: boolean }[]): Promise<Buffer> {
  const doc = new DocxDocument({
    sections: [
      {
        children: paragraphs.map(
          (p) => new Paragraph({ children: [new TextRun({ text: p.text, bold: p.bold })] }),
        ),
      },
    ],
  });
  return Packer.toBuffer(doc);
}

async function readDocumentXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("word/document.xml missing");
  return file.async("string");
}

describe("buildFormattedDocx", () => {
  it("replaces each paragraph's text in place, preserving bold formatting on the reworded heading", async () => {
    const original = await buildTestDocx([
      { text: "DHRUVIL AKBARI", bold: true },
      { text: "Backend Engineer with 5 years of experience." },
      { text: "Skilled in Node.js and PostgreSQL." },
    ]);

    const rewritten = await buildFormattedDocx(original, [
      "DHRUVIL AKBARI (REWORDED)",
      "Backend Engineer, five years, reworded.",
      "Proficient with Node.js, PostgreSQL, reworded.",
    ]);

    const xml = await readDocumentXml(rewritten);

    expect(xml).toContain("DHRUVIL AKBARI (REWORDED)");
    expect(xml).toContain("Backend Engineer, five years, reworded.");
    expect(xml).toContain("Proficient with Node.js, PostgreSQL, reworded.");
    // Original wording is gone, not merely appended alongside.
    expect(xml).not.toContain("5 years of experience");

    // The heading paragraph's <w:b/> (bold run property) survives — only
    // the <w:t> text content was touched, not <w:rPr>.
    const headingParagraphXml = xml.split("Backend Engineer")[0];
    expect(headingParagraphXml).toContain("<w:b/>");
  });

  it("leaves empty (spacer) paragraphs untouched", async () => {
    const original = await buildTestDocx([
      { text: "Line one." },
      { text: "" },
      { text: "Line two." },
    ]);

    // Only 2 non-empty paragraphs, so only 2 rewritten lines are needed.
    const rewritten = await buildFormattedDocx(original, ["Reworded one.", "Reworded two."]);
    const xml = await readDocumentXml(rewritten);

    expect(xml).toContain("Reworded one.");
    expect(xml).toContain("Reworded two.");
  });

  it("throws DocxStructureMismatchError when the line count doesn't match the paragraph count", async () => {
    const original = await buildTestDocx([{ text: "Only one paragraph." }]);

    await expect(
      buildFormattedDocx(original, ["Line one", "Line two, extra"]),
    ).rejects.toThrow(DocxStructureMismatchError);
  });

  it("DocxStructureMismatchError reports both counts", async () => {
    const original = await buildTestDocx([{ text: "A." }, { text: "B." }, { text: "C." }]);

    try {
      await buildFormattedDocx(original, ["Only one line"]);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DocxStructureMismatchError);
      const mismatchErr = err as DocxStructureMismatchError;
      expect(mismatchErr.originalParagraphCount).toBe(3);
      expect(mismatchErr.rewrittenLineCount).toBe(1);
    }
  });

  it("throws a clear error for a file that isn't a valid DOCX", async () => {
    const garbage = Buffer.from("not a real docx file at all");
    await expect(buildFormattedDocx(garbage, ["line"])).rejects.toThrow();
  });
});

describe("buildPlainDocx", () => {
  it("produces a valid, openable .docx containing the rewritten lines", async () => {
    const buf = await buildPlainDocx(["DHRUVIL AKBARI", "Backend Engineer with real experience."]);

    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("word/document.xml")).not.toBeNull();
    expect(zip.file("[Content_Types].xml")).not.toBeNull();

    const xml = await readDocumentXml(buf);
    expect(xml).toContain("DHRUVIL AKBARI");
    expect(xml).toContain("Backend Engineer with real experience.");
  });

  it("bolds all-caps lines (heading heuristic) but not mixed-case lines", async () => {
    const buf = await buildPlainDocx(["AUSBILDUNG", "Master of Engineering, 2027"]);
    const xml = await readDocumentXml(buf);

    const headingParagraph = xml.split("Master of Engineering")[0];
    expect(headingParagraph).toContain("<w:b/>");
  });
});
