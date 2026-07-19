import {
  getMasterTemplates,
  uploadMasterTemplate,
  getTemplateForJobLanguage,
} from "@/actions/templates.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { extractText } from "@/lib/ai/import/extract-text";
import { TemplateKind, TemplateSlot } from "@/models/template.model";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import { writeFile } from "fs/promises";

const prisma = new PrismaClient();

vi.mock("@prisma/client", () => {
  const mPrismaClient = {
    masterTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((cb: any) => cb(mPrismaClient)),
  };
  return { PrismaClient: vi.fn(function () { return mPrismaClient; }) };
});

vi.mock("@/utils/user.utils", () => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/ai/import/extract-text", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/import/extract-text")>();
  return { ...actual, extractText: vi.fn() };
});

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, default: { ...actual, existsSync: vi.fn(() => true), mkdirSync: vi.fn() }, existsSync: vi.fn(() => true), mkdirSync: vi.fn() };
});

vi.mock("fs/promises", () => {
  const writeFileMock = vi.fn();
  return { writeFile: writeFileMock, default: { writeFile: writeFileMock } };
});

const VALID_USER = { id: "user-1", name: "Test", email: "test@test.com" };

const PDF_BYTES = Buffer.concat([
  Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  Buffer.from("rest of a fake pdf body"),
]);
const ZIP_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]), // PK\x03\x04
  Buffer.from("rest of a fake docx body"),
]);

function makeFile(bytes: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function formDataWithFile(file: File): FormData {
  const fd = new FormData();
  fd.append("file", file);
  return fd;
}

describe("templates.actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockResolvedValue(VALID_USER);
  });

  describe("getMasterTemplates", () => {
    it("returns the current-version templates for the user", async () => {
      const rows = [
        { id: "t1", slot: "RESUME_EN", version: 2, fileName: "resume.pdf", createdAt: new Date() },
      ];
      (prisma.masterTemplate.findMany as any).mockResolvedValue(rows);

      const result = await getMasterTemplates();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(prisma.masterTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: VALID_USER.id, isCurrent: true } }),
      );
    });

    it("fails cleanly when not authenticated", async () => {
      (getCurrentUser as any).mockResolvedValue(null);
      const result = await getMasterTemplates();
      expect(result.success).toBe(false);
    });
  });

  describe("uploadMasterTemplate", () => {
    it("rejects an invalid slot", async () => {
      const result = await uploadMasterTemplate("NOT_A_SLOT" as TemplateSlot, formDataWithFile(makeFile(PDF_BYTES, "a.pdf", "application/pdf")));
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/invalid template slot/i);
    });

    it("rejects when no file is provided", async () => {
      const result = await uploadMasterTemplate(TemplateSlot.RESUME_EN, new FormData());
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/no file provided/i);
    });

    it("rejects a disallowed mime type", async () => {
      const file = makeFile(PDF_BYTES, "resume.txt", "text/plain");
      const result = await uploadMasterTemplate(TemplateSlot.RESUME_EN, formDataWithFile(file));
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/only pdf and \.docx/i);
    });

    it("rejects file content that doesn't match its declared mime type (magic-byte check)", async () => {
      const file = makeFile(Buffer.from("not actually a pdf"), "resume.pdf", "application/pdf");
      const result = await uploadMasterTemplate(TemplateSlot.RESUME_EN, formDataWithFile(file));
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/does not match declared type/i);
    });

    it("surfaces an extraction failure instead of creating a row", async () => {
      const file = makeFile(PDF_BYTES, "resume.pdf", "application/pdf");
      (extractText as any).mockResolvedValue({
        success: false,
        error: { code: "NO_TEXT", message: "Couldn't read any text from this document." },
      });

      const result = await uploadMasterTemplate(TemplateSlot.RESUME_EN, formDataWithFile(file));
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/couldn't read any text/i);
      expect(prisma.masterTemplate.create).not.toHaveBeenCalled();
    });

    it("creates version 1 when no prior template exists for the slot", async () => {
      const file = makeFile(PDF_BYTES, "resume.pdf", "application/pdf");
      (extractText as any).mockResolvedValue({ success: true, data: { text: "Real extracted resume wording", truncated: false } });
      (prisma.masterTemplate.findFirst as any).mockResolvedValue(null);
      (prisma.masterTemplate.create as any).mockImplementation(({ data }: any) => ({ id: "new-id", ...data }));

      const result = await uploadMasterTemplate(TemplateSlot.RESUME_EN, formDataWithFile(file));

      expect(result.success).toBe(true);
      expect(result.data.version).toBe(1);
      expect(prisma.masterTemplate.updateMany).toHaveBeenCalledWith({
        where: { userId: VALID_USER.id, slot: TemplateSlot.RESUME_EN, isCurrent: true },
        data: { isCurrent: false },
      });
      expect(prisma.masterTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slot: TemplateSlot.RESUME_EN,
            version: 1,
            isCurrent: true,
            extractedText: "Real extracted resume wording",
            fileName: "resume.pdf",
          }),
        }),
      );
      expect(writeFile).toHaveBeenCalled();
    });

    it("versions up (v1 -> v2) and marks the prior current version non-current, without deleting it", async () => {
      const file = makeFile(ZIP_BYTES, "cover-letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      (extractText as any).mockResolvedValue({ success: true, data: { text: "Verbatim cover letter wording", truncated: false } });
      (prisma.masterTemplate.findFirst as any).mockResolvedValue({ version: 1 });
      (prisma.masterTemplate.create as any).mockImplementation(({ data }: any) => ({ id: "new-id-2", ...data }));

      const result = await uploadMasterTemplate(TemplateSlot.COVER_LETTER_DE, formDataWithFile(file));

      expect(result.success).toBe(true);
      expect(result.data.version).toBe(2);
      expect(prisma.masterTemplate.updateMany).toHaveBeenCalledWith({
        where: { userId: VALID_USER.id, slot: TemplateSlot.COVER_LETTER_DE, isCurrent: true },
        data: { isCurrent: false },
      });
      // Old version is only flipped to isCurrent:false, never removed via delete.
      expect((prisma.masterTemplate as any).delete).toBeUndefined();
    });
  });

  describe("getTemplateForJobLanguage", () => {
    it("returns null data (not an error) when the job's language isn't set yet", async () => {
      const result = await getTemplateForJobLanguage(TemplateKind.COVER_LETTER, null);
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(prisma.masterTemplate.findFirst).not.toHaveBeenCalled();
    });

    it("returns null data when the job's language has no matching template uploaded", async () => {
      (prisma.masterTemplate.findFirst as any).mockResolvedValue(null);
      const result = await getTemplateForJobLanguage(TemplateKind.COVER_LETTER, "de");
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(prisma.masterTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: VALID_USER.id, slot: TemplateSlot.COVER_LETTER_DE, isCurrent: true },
        }),
      );
    });

    it("returns the matching template when one exists, resolving en/de correctly per kind", async () => {
      const row = { id: "t9", slot: "RESUME_EN", version: 3, fileName: "resume.pdf", createdAt: new Date() };
      (prisma.masterTemplate.findFirst as any).mockResolvedValue(row);
      const result = await getTemplateForJobLanguage(TemplateKind.RESUME, "en");
      expect(result.success).toBe(true);
      expect(result.data.fileName).toBe("resume.pdf");
      expect(prisma.masterTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: VALID_USER.id, slot: TemplateSlot.RESUME_EN, isCurrent: true },
        }),
      );
    });
  });
});
