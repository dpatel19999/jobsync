// Builds a downloadable .docx for a position-locked resume rewrite.
//
// Two paths:
// - buildFormattedDocx: the original master template was itself a .docx —
//   edits word/document.xml's paragraph text in place (only <w:t> content
//   is touched; <w:pPr>/<w:rPr> formatting nodes are left completely
//   alone), so fonts/spacing/layout survive as closely as a text-only edit
//   can get them. See the known limitations noted on the function itself.
// - buildPlainDocx: fallback for everything else (original was a PDF, the
//   original .docx's paragraph structure no longer lines up with the
//   rewritten line count, or the source file is missing) — a clean,
//   simply-formatted document built from scratch with the `docx` package.
//   Not visually the original, and callers must say so.

import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type {
  Document as XmlDocument,
  Element as XmlElement,
} from "@xmldom/xmldom";
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const DOCUMENT_XML_PATH = "word/document.xml";

export class DocxStructureMismatchError extends Error {
  constructor(
    public readonly originalParagraphCount: number,
    public readonly rewrittenLineCount: number,
  ) {
    super(
      `The original DOCX has ${originalParagraphCount} text paragraphs but the rewritten content has ${rewrittenLineCount} lines — can't safely map the rewritten text back onto the original structure.`,
    );
    this.name = "DocxStructureMismatchError";
  }
}

function getParagraphText(paragraph: XmlElement): string {
  const tNodes = paragraph.getElementsByTagName("w:t");
  let text = "";
  for (let i = 0; i < tNodes.length; i++) {
    text += tNodes[i].textContent ?? "";
  }
  return text;
}

// <w:p> elements wherever they occur (body, table cells, etc.), in document
// order. Headers/footers live in separate XML parts (word/header1.xml etc.)
// and are never touched here — extractText()'s mammoth-based extraction
// (what the AI actually rewrote from) doesn't include header/footer text
// either, so there's no rewritten replacement for them anyway.
function getAllParagraphs(doc: XmlDocument): XmlElement[] {
  const nodeList = doc.getElementsByTagName("w:p");
  const result: XmlElement[] = [];
  for (let i = 0; i < nodeList.length; i++) {
    result.push(nodeList[i]);
  }
  return result;
}

/**
 * Rewrites an original .docx's paragraph text in place.
 *
 * Known limitations (flagged, not silently glossed over):
 * - A paragraph with multiple runs of different formatting (e.g. a bold
 *   word followed by normal text on the same line) collapses onto the
 *   FIRST run's formatting for the whole rewritten line — there's no
 *   general way to know which words of a reworded sentence should keep
 *   which original run's styling, so this takes the simpler, safer option
 *   rather than guessing at a word-level mapping.
 * - Non-text run content in a non-first run of a rewritten paragraph (e.g.
 *   a stray <w:tab/>) is left in place but its text is cleared; this can
 *   leave a harmless empty run behind.
 * - Table cells are walked the same as body paragraphs; a resume that puts
 *   substantial content in complex table layouts may not align with how
 *   extractText() linearized that same content, in which case this throws
 *   DocxStructureMismatchError rather than writing into the wrong cell.
 *
 * @throws DocxStructureMismatchError if the number of non-empty text
 * paragraphs found doesn't match rewrittenLines.length — callers should
 * fall back to buildPlainDocx() rather than catch and ignore this.
 */
export async function buildFormattedDocx(
  originalDocxBuffer: Buffer,
  rewrittenLines: string[],
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(originalDocxBuffer);
  const documentXmlFile = zip.file(DOCUMENT_XML_PATH);
  if (!documentXmlFile) {
    throw new Error("Not a valid DOCX file — word/document.xml not found.");
  }
  const xml = await documentXmlFile.async("string");

  const doc = new DOMParser().parseFromString(xml, "text/xml") as unknown as XmlDocument;
  const paragraphs = getAllParagraphs(doc);
  const textParagraphs = paragraphs.filter((p) => getParagraphText(p).trim().length > 0);

  if (textParagraphs.length !== rewrittenLines.length) {
    throw new DocxStructureMismatchError(textParagraphs.length, rewrittenLines.length);
  }

  textParagraphs.forEach((paragraph, i) => {
    const runs = paragraph.getElementsByTagName("w:r");
    const newText = rewrittenLines[i];
    let wroteText = false;

    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      const tNodes = run.getElementsByTagName("w:t");
      for (let t = 0; t < tNodes.length; t++) {
        const tNode = tNodes[t];
        while (tNode.firstChild) tNode.removeChild(tNode.firstChild);
        if (!wroteText) {
          tNode.appendChild(doc.createTextNode(newText));
          tNode.setAttribute("xml:space", "preserve");
          wroteText = true;
        }
      }
    }

    if (!wroteText) {
      // textParagraphs was filtered by getParagraphText() finding non-empty
      // <w:t> content, so every entry here should have at least one <w:t> —
      // guard anyway rather than silently drop a line.
      throw new Error(`Could not locate a text run to rewrite in paragraph ${i + 1} of ${textParagraphs.length}.`);
    }
  });

  const newXml = new XMLSerializer().serializeToString(doc);
  zip.file(DOCUMENT_XML_PATH, newXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

// Section-heading heuristic matches the fixture resume's real convention
// ("AUSBILDUNG", "BERUFSERFAHRUNG", the name line) — an all-caps-or-mostly
// line of reasonable length. Not a general resume-parsing solution, just a
// small readability nicety for the from-scratch fallback.
function looksLikeHeading(line: string): boolean {
  const letters = line.replace(/[^\p{L}]/gu, "");
  return (
    letters.length >= 3 &&
    letters === letters.toUpperCase() &&
    letters !== letters.toLowerCase()
  );
}

/**
 * Builds a clean, simply-formatted .docx from scratch (not a reconstruction
 * of any original file) — used when the original master template wasn't a
 * .docx, its paragraph structure no longer matches the rewritten line
 * count, or the original file can't be found on disk.
 */
export async function buildPlainDocx(rewrittenLines: string[]): Promise<Buffer> {
  const doc = new DocxDocument({
    sections: [
      {
        children: rewrittenLines.map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line, bold: looksLikeHeading(line) })],
              spacing: { after: 120 },
            }),
        ),
      },
    ],
  });
  return Packer.toBuffer(doc);
}
